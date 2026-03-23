import electron from 'electron'

/**
 * Wraps ipcRenderer send/once pair into promise.
 * Rejected automatically if response is not received in 60 seconds.
 * @param {string} topic Topic name to send to
 * @param {string} from Topic name to listen from
 * @param {*} data Data to send to server
 * @param {number} [timeout=60000] How much time to wait for response (ms)
 */
export default function (topic, callbackTopic, data, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const listener = function (event, response) {
      if (tm) { clearTimeout(tm) }
      if (response instanceof Error) {
        return reject(response)
      }
      if (response && typeof response === 'object' && typeof response.message === 'string' && ('stack' in response || 'code' in response)) {
        const error = new Error(response.message)
        if (response.stack) error.stack = response.stack
        if (response.code) error.code = response.code
        return reject(error)
      }
      resolve(response)
    }
    electron.ipcRenderer.once(callbackTopic, listener)
    electron.ipcRenderer.send(topic, callbackTopic, data)
    let tm = setTimeout(() => {
      electron.ipcRenderer.removeListener(callbackTopic, listener)
      reject(new Error(`Request Timeout: ${callbackTopic}`))
    }, timeout)
  })
}
