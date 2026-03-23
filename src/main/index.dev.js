/**
 * This file is used specifically and only for development. It installs
 * `electron-debug` & `vue-devtools`. There shouldn't be any need to
 *  modify this file, but it can be used to extend your development
 *  environment.
 */

/* eslint-disable */

// Older electron-debug releases are not reliable on modern Electron.
if (process.env.ELECTRON_DEBUG === '1' && process.versions && process.versions.electron) {
  try {
    require('electron-debug')({ showDevTools: true })
  } catch (error) {
    console.warn('electron-debug failed to initialize', error)
  }
}

// Require `main` process to boot app
require('./index')
