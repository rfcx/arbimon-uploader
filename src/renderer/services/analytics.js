import axios from 'axios'

const GA_ENDPOINT = 'https://www.google-analytics.com/collect'

function createNoopAnalytics () {
  return {
    send: async () => {}
  }
}

function createPayload (trackId, options, eventType, params) {
  const payload = {
    v: 1,
    tid: trackId,
    t: eventType,
    cid: params.cid || options.clientId || 'anonymous'
  }

  Object.keys(params).forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) {
      payload[key] = params[key]
    }
  })

  if (!payload.an && options.appName) payload.an = options.appName
  if (!payload.av && options.appVersion) payload.av = options.appVersion

  return payload
}

export function createAnalytics (trackId, options = {}) {
  if (!trackId) {
    return createNoopAnalytics()
  }

  return {
    async send (eventType, params = {}) {
      try {
        const payload = createPayload(trackId, options, eventType, params)
        await axios.post(GA_ENDPOINT, new URLSearchParams(payload).toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        })
      } catch (error) {
        console.info('[Analytics] failed to send event', error)
      }
    }
  }
}
