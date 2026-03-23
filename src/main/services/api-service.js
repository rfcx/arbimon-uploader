import settings from 'electron-settings'

function getAPIUrl () {
  const isProd = settings.get('settings.production_env')
  const platform = settings.get('settings.platform')
  let url = global.ingestServicelUrl
  if (url) {
    return url
  }
  switch (platform) {
    case 'google':
      url = isProd ? 'https://us-central1-rfcx-ingest-257610.cloudfunctions.net/api' : 'https://us-central1-rfcx-ingest-dev.cloudfunctions.net/api'
      break
    case 'amazon':
    default:
      url = isProd ? 'https://ingest.rfcx.org' : 'https://staging-ingest.rfcx.org'
  }
  return url
}

export default {
  getAPIUrl
}
