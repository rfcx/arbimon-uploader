'use strict'

var utils = require('axios/lib/utils')
var settle = require('axios/lib/core/settle')
var buildURL = require('axios/lib/helpers/buildURL')
var http = require('http')
var https = require('https')
var httpFollow = require('follow-redirects').http
var httpsFollow = require('follow-redirects').https
var url = require('url')
var zlib = require('zlib')
var createError = require('axios/lib/core/createError')
var enhanceError = require('axios/lib/core/enhanceError')

/* eslint consistent-return:0 */
export default function httpAdapter (config) {
  return new Promise(function dispatchHttpRequest (resolve, reject) {
    var data = config.data
    var headers = config.headers
    var timer

    // Set User-Agent (required by some servers)
    // Only set header if it hasn't been set in config
    // See https://github.com/axios/axios/issues/69
    if (!headers['User-Agent'] && !headers['user-agent']) {
      headers['User-Agent'] = 'axios-http-adapter/0.0.1'
    }

    // HTTP basic authentication
    var auth
    if (config.auth) {
      var username = config.auth.username || ''
      var password = config.auth.password || ''
      auth = username + ':' + password
    }

    // Parse url
    var parsed = url.parse(config.url)
    var protocol = parsed.protocol || 'http:'

    if (!auth && parsed.auth) {
      var urlAuth = parsed.auth.split(':')
      var urlUsername = urlAuth[0] || ''
      var urlPassword = urlAuth[1] || ''
      auth = urlUsername + ':' + urlPassword
    }

    if (auth) {
      delete headers.Authorization
    }

    var isHttps = protocol === 'https:'
    var agent = isHttps ? config.httpsAgent : config.httpAgent

    var options = {
      path: buildURL(parsed.path, config.params, config.paramsSerializer).replace(/^\?/, ''),
      method: config.method,
      headers: headers,
      agent: agent,
      auth: auth
    }

    if (config.socketPath) {
      options.socketPath = config.socketPath
    } else {
      options.hostname = parsed.hostname
      options.port = parsed.port
    }

    var proxy = config.proxy
    if (!proxy && proxy !== false) {
      var proxyEnv = protocol.slice(0, -1) + '_proxy'
      var proxyUrl = process.env[proxyEnv] || process.env[proxyEnv.toUpperCase()]
      if (proxyUrl) {
        var parsedProxyUrl = url.parse(proxyUrl)
        proxy = {
          host: parsedProxyUrl.hostname,
          port: parsedProxyUrl.port
        }

        if (parsedProxyUrl.auth) {
          var proxyUrlAuth = parsedProxyUrl.auth.split(':')
          proxy.auth = {
            username: proxyUrlAuth[0],
            password: proxyUrlAuth[1]
          }
        }
      }
    }

    var transport
    if (config.transport) {
      transport = config.transport
    } else if (config.maxRedirects === 0) {
      transport = isHttps ? https : http
    } else {
      if (config.maxRedirects) {
        options.maxRedirects = config.maxRedirects
      }
      transport = isHttps ? httpsFollow : httpFollow
    }

    if (config.maxContentLength && config.maxContentLength > -1) {
      options.maxBodyLength = config.maxContentLength
    }

    // Create the request
    var req = transport.request(options, function handleResponse (res) {
      if (req.aborted) return

      // Response has been received so kill timer that handles request timeout
      clearTimeout(timer)
      timer = null

      // uncompress the response body transparently if required
      var stream = res
      switch (res.headers['content-encoding']) {
        /* eslint default-case:0 */
        case 'gzip':
        case 'compress':
        case 'deflate':
          // add the unzipper to the body stream processing pipeline
          stream = stream.pipe(zlib.createUnzip())

          // remove the content-encoding in order to not confuse downstream operations
          delete res.headers['content-encoding']
          break
      }

      // return the last request in case of redirects
      var lastRequest = res.req || req

      var response = {
        status: res.statusCode,
        statusText: res.statusMessage,
        headers: res.headers,
        config: config,
        request: lastRequest
      }

      if (config.responseType === 'stream') {
        response.data = stream
        settle(resolve, reject, response)
      } else {
        var responseBuffer = []
        stream.on('data', function handleStreamData (chunk) {
          responseBuffer.push(chunk)

          // make sure the content length is not over the maxContentLength if specified
          if (config.maxContentLength > -1 && Buffer.concat(responseBuffer).length > config.maxContentLength) {
            stream.destroy()
            reject(createError('maxContentLength size of ' + config.maxContentLength + ' exceeded',
              config, null, lastRequest))
          }
        })

        stream.on('error', function handleStreamError (err) {
          if (req.aborted) return
          reject(enhanceError(err, config, null, lastRequest))
        })

        stream.on('end', function handleStreamEnd () {
          var responseData = Buffer.concat(responseBuffer)
          if (config.responseType !== 'arraybuffer') {
            responseData = responseData.toString('utf8')
          }

          response.data = responseData
          settle(resolve, reject, response)
        })
      }
    })

    // Handle errors
    req.on('error', function handleRequestError (err) {
      if (req.aborted) return
      reject(enhanceError(err, config, null, req))
    })

    // Handle request timeout
    if (config.timeout && !timer) {
      timer = setTimeout(function handleRequestTimeout () {
        req.abort()
        reject(createError('timeout of ' + config.timeout + 'ms exceeded', config, 'ECONNABORTED', req))
      }, config.timeout)
    }

    if (config.cancelToken) {
      // Handle cancellation
      config.cancelToken.promise.then(function onCanceled (cancel) {
        if (req.aborted) return

        req.abort()
        reject(cancel)
      })
    }

    // Send the request
    if (utils.isStream(data)) {
      data.pipe(req)
    } else {
      req.end(data)
    }
  })
}
