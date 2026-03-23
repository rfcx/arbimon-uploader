const jwtDecode = require('jwt-decode')
const request = require('request')
const url = require('url')
const os = require('os')
import tokenStore from './token-store'

const { apiIdentifier, auth0Domain, clientId, redirectUri } = require('../../../env').auth0

const keytarAccount = os.userInfo().username

let accessToken = null
let profile = null
let refreshToken = null

async function getAccessToken () {
  return new Promise(async (resolve, reject) => {
    const access = await tokenStore.getPassword('ingest-app-access-token', keytarAccount)
    if (!access) return reject(new Error('no access token available'))
    resolve(access)
  })
}

async function getIdToken () {
  return tokenStore.getPassword('ingest-app-id-token', keytarAccount)
}

function getAuthenticationURL () {
  return (
    `https://${auth0Domain}/authorize?audience=${apiIdentifier}&scope=openid%20email%20profile%20offline_access` +
    `&response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&theme=dark`
  )
}

function getLogoutURL () {
  return (
    `https://${auth0Domain}/v2/logout?federated&client_id=${clientId}`
  )
}

async function refreshTokens () {
  console.info('[AuthService] refreshTokens')
  return new Promise(async (resolve, reject) => {
    const refreshToken = await tokenStore.getPassword('ingest-app-refresh-token', keytarAccount)
    if (!refreshToken) return reject(new Error('no refresh token available'))

    const refreshOptions = {
      method: 'POST',
      url: `https://${auth0Domain}/oauth/token`,
      headers: { 'content-type': 'application/json' },
      body: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken
      },
      json: true
    }

    request(refreshOptions, async (error, response, body) => {
      if (error) {
        logout()
        return reject(new Error(error))
      }
      await parseTokens(body)
      resolve()
    })
  })
}

async function loadTokens (callbackURL) {
  console.info('[AuthService] loadTokens')
  return new Promise((resolve, reject) => {
    const urlParts = url.parse(callbackURL, true)
    const query = urlParts.query

    const exchangeOptions = {
      grant_type: 'authorization_code',
      client_id: clientId,
      code: query.code,
      redirect_uri: redirectUri
    }

    const options = {
      method: 'POST',
      url: `https://${auth0Domain}/oauth/token`,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(exchangeOptions)
    }

    request(options, async (error, resp, body) => {
      if (error) {
        console.info('[AuthService] loadTokens error', error)
        logout()
        return reject(error)
      }
      const responseBody = JSON.parse(body)
      try {
        await parseTokens(responseBody)
      } catch (e) {
        console.info('[AuthService] parseTokens error', e)
        logout()
        return reject(e)
      }
      refreshToken = responseBody.refresh_token
      await tokenStore.setPassword('ingest-app-refresh-token', keytarAccount, refreshToken)
      resolve()
    })
  })
}

async function parseTokens (responseBody) {
  let appMetadata = 'https://rfcx.org/app_metadata'
  let userMetadata = 'https://rfcx.org/user_metadata'
  accessToken = responseBody.access_token
  await tokenStore.setPassword('ingest-app-access-token', keytarAccount, accessToken)
  profile = jwtDecode(responseBody.id_token)
  await tokenStore.setPassword('ingest-app-id-token', keytarAccount, responseBody.id_token)
  if (profile && profile.given_name) {
    global.firstname = profile.given_name
  } else if (profile && profile[userMetadata] && profile[userMetadata].given_name) {
    global.firstname = profile[userMetadata].given_name
  }
  if (profile && profile[appMetadata]) {
    global.accessibleSites = profile[appMetadata].accessibleSites
    global.defaultSite = profile[appMetadata].defaultSite
  }
  if (profile && profile.picture) {
    global.picture = profile.picture
  }
  if (profile && profile.guid) {
    global.userId = profile.guid
  }
  global.consentGiven = profile && profile[userMetadata] && profile[userMetadata].consentGiven !== undefined &&
    profile[userMetadata].consentGiven.toString() === 'true'
  console.info('[AuthService] parse tokens finished')
}

async function logout () {
  await tokenStore.deletePassword('ingest-app-refresh-token', keytarAccount)
  await tokenStore.deletePassword('ingest-app-access-token', keytarAccount)
  await tokenStore.deletePassword('ingest-app-id-token', keytarAccount)
  accessToken = null
  profile = null
  refreshToken = null
  console.info('[AuthService] tokens deleted')
}

export default {
  getAccessToken,
  getAuthenticationURL,
  getLogoutURL,
  getIdToken,
  loadTokens,
  logout,
  refreshTokens
}
