'use strict'

const httpCommon = require('_http_common')

const originalBinding = process.binding

process.binding = function binding (name) {
  if (name === 'http_parser') {
    return {
      HTTPParser: httpCommon.HTTPParser,
      methods: httpCommon.methods
    }
  }

  return originalBinding.call(process, name)
}
