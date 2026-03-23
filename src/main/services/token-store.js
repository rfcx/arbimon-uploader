import settings from 'electron-settings'

const TOKENS_KEY = 'auth_tokens'

function getAllTokens () {
  return settings.get(TOKENS_KEY) || {}
}

function getTokenKey (service, account) {
  return `${encodeURIComponent(service)}:${encodeURIComponent(account)}`
}

async function getPassword (service, account) {
  const tokens = getAllTokens()
  const value = tokens[getTokenKey(service, account)]
  return value === undefined ? null : value
}

async function setPassword (service, account, password) {
  const tokens = getAllTokens()
  tokens[getTokenKey(service, account)] = password
  settings.set(TOKENS_KEY, tokens)
}

async function deletePassword (service, account) {
  const tokens = getAllTokens()
  const tokenKey = getTokenKey(service, account)
  const deleted = Object.prototype.hasOwnProperty.call(tokens, tokenKey)
  delete tokens[tokenKey]
  settings.set(TOKENS_KEY, tokens)
  return deleted
}

export default {
  getPassword,
  setPassword,
  deletePassword
}
