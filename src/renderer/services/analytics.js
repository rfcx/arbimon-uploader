let AnalyticsLib = null

try {
  AnalyticsLib = require('electron-ga')
  AnalyticsLib = AnalyticsLib && AnalyticsLib.default ? AnalyticsLib.default : AnalyticsLib
} catch (error) {
  AnalyticsLib = null
}

function createNoopAnalytics () {
  return {
    send: async () => {}
  }
}

export function createAnalytics (trackId, options = {}) {
  if (!AnalyticsLib) {
    return createNoopAnalytics()
  }

  try {
    return new AnalyticsLib(trackId, options)
  } catch (error) {
    console.info('[Analytics] disabled', error)
    return createNoopAnalytics()
  }
}
