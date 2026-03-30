'use strict'

import { commonProcess, mainProcess, backgroundProcess, dbProcess, menuProcess, aboutProcess, preferenceProcess, updateProcess } from './processes'
import settings from 'electron-settings'
import createAuthWindow from './services/auth-process'
import authService from './services/auth-service'
import sharedProcess from './processes/shared'
const { app, ipcMain, BrowserWindow, session } = require('electron')
const path = require('path')
const jwtDecode = require('jwt-decode')
const setupEvents = require('./../../setupEvents')
const log = require('electron-log')
const remoteMain = require('@electron/remote/main')
console.log = log.log
console.info = log.info
console.error = log.error
log.transports.console.format = '{h}:{i}:{s} {text}'
log.transports.file.getFile()

process.on('uncaughtException', (error) => {
  console.error('[App] uncaughtException', error)
})

process.on('unhandledRejection', (error) => {
  console.error('[App] unhandledRejection', error)
})

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
// Fix Load Tokens error: unable to get local issuer certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
if (process.env.NODE_ENV !== 'development') {
  global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}
let mainWindow, backgroundAPIWindow, dbWindow, aboutWindow, updatePopupWindow, preferencesPopupWindow
let idToken
let refreshIntervalTimeout, expires
let willQuitApp = false
let isLogOut = false
let dayInMs = 60 * 60 * 24 * 1000
// let weekInMs = dayInMs * 7
const gotTheLock = app.requestSingleInstanceLock()

remoteMain.initialize()

function createWindow (openedAsHidden = false) {
  createRefreshInterval()
  if (!idToken) getIdToken()
  /**
   * Initial window options
   */
  createMenu()
  mainWindow = mainProcess.createWindow(!openedAsHidden,
    (e) => {
      if (mainWindow.isFullScreen()) {
        mainWindow.once('leave-full-screen', (e1) => {
          mainWindow.hide()
        })
        mainWindow.setFullScreen(false)
      }
      closeMainWindow(e)
    }, (e) => {
      resetTimers()
      mainWindow = null
    })

  backgroundAPIWindow = backgroundProcess.createWindow()
  dbWindow = dbProcess.createWindow()
}

function createAutoUpdaterSub () {
  updateProcess.createAutoUpdaterSub(() => {
    // update not avaliable
    const shouldDisplayUpToDatePopUp = settings.get('settings.should_display_up_to_date')
    if (mainWindow && shouldDisplayUpToDatePopUp) {
      mainWindow.webContents.send('showUpToDatePopup', true)
      settings.set('settings.should_display_up_to_date', false)
    }
  }, () => {
    // start updating process
    setTimeout(() => {
      console.info('[Update] start updating...')
      mainWindow = null
      if (backgroundAPIWindow) {
        backgroundAPIWindow = null
      }
      if (dbWindow) {
        dbWindow = null
      }
      if (preferencesPopupWindow) {
        preferencesPopupWindow.destroy()
        preferencesPopupWindow = null
      }
      if (updatePopupWindow) {
        updatePopupWindow.destroy()
        updatePopupWindow = null
      }
      if (aboutWindow) {
        aboutWindow.destroy()
        aboutWindow = null
      }
      resetTimers()
      app.exit()
      app.quit()
      settings.set('settings.should_display_up_to_date', true)
    }, 2000)
  })
}

function createMenu () {
  const clearDataFunction = async () => {
    await sharedProcess.clearAllData()
    mainWindow.webContents.send('onClearAllData')
  }

  const logoutFn = async () => {
    logOut()
  }

  const prefFn = function () {
    if (!preferencesPopupWindow || preferencesPopupWindow.isDestroyed()) {
      preferencesPopupWindow = preferenceProcess.createWindow(true)
    }
    preferencesPopupWindow.show()
  }

  const updateFn = function () {
    if (updatePopupWindow) {
      updatePopupWindow.destroy()
      updatePopupWindow = null
    }
    // set this to true so that the update popup will be shown
    settings.set('settings.should_display_up_to_date', true)
    updateProcess.checkForUpdates()
  }

  const aboutFn = function () {
    if (!aboutWindow || aboutWindow.isDestroyed()) {
      aboutWindow = aboutProcess.createWindow(true)
    }
    aboutWindow.show()
  }
  menuProcess.createMenu(clearDataFunction, logoutFn, prefFn, aboutFn, updateFn)
}

function showMainWindow () {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
}

async function closeMainWindow (e) {
  console.info('[MainWindow] closing main window / willQuitApp =', willQuitApp)
  if (willQuitApp) {
    console.info('[MainWindow] c exit')
    mainWindow = null
    if (backgroundAPIWindow) {
      backgroundAPIWindow = null
    }
    if (dbWindow) {
      dbWindow = null
    }
    if (preferencesPopupWindow) {
      preferencesPopupWindow.destroy()
      preferencesPopupWindow = null
    }
    if (updatePopupWindow) {
      updatePopupWindow.destroy()
      updatePopupWindow = null
    }
    if (aboutWindow) {
      aboutWindow.destroy()
      aboutWindow = null
    }
    resetTimers()
    app.exit()
    app.quit()
  } else if (isLogOut) {
    console.info('[MainWindow] logout')
    resetTimers()
    await authService.logout()
    await logOut()
    createAuthWindow()
    if (mainWindow) {
      mainWindow.destroy()
      mainWindow = null
    }
    idToken = null
    isLogOut = false
  } else {
    console.info('[MainWindow] close')
    if (process.platform === 'win32' || process.platform === 'win64') {
      mainWindow = null
      resetTimers()
      app.exit()
      app.quit()
      return
    }
    e.preventDefault()
    mainWindow.hide()
  }
}

function initialSettings () {
  if (settings.get('settings') === undefined) {
    settings.set('settings', {
      auto_start: false,
      production_env: true,
      platform: 'amazon',
      darkMode: true,
      auto_update_app: true,
      onLine: true,
      should_display_up_to_date: true
    })
  }
  if (settings.get('settings.auto_update_app') === undefined) {
    settings.set('settings.auto_update_app', true)
  }
  if (settings.get('settings.should_display_up_to_date') === undefined) {
    settings.set('settings.should_display_up_to_date', true)
  }
  if (settings.get('settings.onLine') === undefined) {
    settings.set('settings.onLine', true)
  }
  if (settings.get('settings.auto_start') === undefined) {
    settings.set('settings.auto_start', false)
  }
  commonProcess.setLoginItem(settings.get('settings.auto_start'))
}

async function createAppWindow (openedAsHidden) {
  try {
    // An Entry for users who has already existing token
    await authService.getIdToken()
    await checkToken()
    await getUserInfo()
    console.info('[MainWindow] create')
    createWindow(openedAsHidden)
    resetFirstLogInCondition()
  } catch (err) {
    // An Entry for new users
    console.info('[MainWindow] someting wrong about Auth, creating Auth Window', err)
    authService.logout().catch((logoutErr) => {
      console.error('[Auth] logout before auth window failed', logoutErr)
    })
    createAuthWindow()
  }
}

async function createLogoutWindow () {
  const logoutWindow = new BrowserWindow({
    show: false
  })

  logoutWindow.loadURL(authService.getLogoutURL())

  logoutWindow.on('ready-to-show', async () => {
    console.info('[MainWindow] processed logout url')
    logoutWindow.close()
  })
}

async function checkToken () {
  console.info('[Auth] checking token')
  return new Promise(async (resolve, reject) => {
    idToken = null
    const now = Date.now()
    idToken = await authService.getIdToken()
    if (!idToken) return reject(new Error('no id token available'))
    let profile = jwtDecode(idToken)
    if (profile) {
      expires = profile.exp * 1000
      if (now > expires) {
        logOut()
        return resolve()
      } else if ((expires - now) <= dayInMs) {
        refreshTokens()
      }
    }
    resolve()
  })
}

async function getIdToken () {
  idToken = await authService.getIdToken()
}

async function getUserInfo () {
  console.info('[Auth] get user info')
  return new Promise(async (resolve, reject) => {
    if (!idToken) {
      idToken = await authService.getIdToken()
      if (!idToken) return reject(new Error('no id token available'))
    }
    let profile = jwtDecode(idToken)
    let appMetadata = 'https://rfcx.org/app_metadata'
    let userMetadata = 'https://rfcx.org/user_metadata'
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
    resolve()
  })
}

async function refreshTokens () {
  try {
    await authService.refreshTokens()
  } catch (err) {
    logOut()
  }
}

async function logOut () {
  await authService.logout()
  await createLogoutWindow()
  settings.set('settings.production_env', true)
  await commonProcess.clearAllData()
  hideMainWindowAndForceLogin()
  resetFirstLogInCondition()
}

function hideMainWindowAndForceLogin () {
  if (mainWindow) {
    isLogOut = true
    mainWindow.close()
  }
  idToken = null
}

async function createRefreshInterval () {
  refreshIntervalTimeout = setInterval(() => {
    checkToken()
  }, dayInMs)
}

function resetTimers () {
  if (refreshIntervalTimeout) {
    clearInterval(refreshIntervalTimeout)
  }
}
if (!gotTheLock) {
  app.exit()
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // When run a second instance.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function resetFirstLogInCondition () {
  global.firstLogIn = false
}

function checkIngestServicelUrl () {
  if (process.env.npm_config_url) {
    global.ingestServicelUrl = process.env.npm_config_url
  }
}

function isSquirrelFirstRun () {
  return (process.argv || []).includes('--squirrel-firstrun')
}

app.commandLine.appendArgument('--enable-features=Metal')
app.on('ready', async () => {
  if (`${process.env.VUE_DEV_TOOLS_ENABLED}` === 'true') {
    try {
      const os = require('os')
      // Install vue dev tools
      // TODO: the path should be configurable by the developer
      const devToolsPath = path.join(
        os.homedir(),
        '/Library/Application Support/Google/Chrome/Profile 2/Extensions/nhdogjmejiglipccpnnnanhbledajbpd/5.3.4_0'
      )
      await session.defaultSession.loadExtension(devToolsPath)
    } catch (e) {
      console.error('Can not init vue dev tools', e)
    }
  }

  if (setupEvents.handleSquirrelEvent(app)) return
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
  let openedAsHidden = false
  if (process.platform === 'darwin') openedAsHidden = app.getLoginItemSettings().wasOpenedAsHidden
  else openedAsHidden = (process.argv || []).indexOf('--hidden') !== -1
  checkIngestServicelUrl()
  initialSettings()
  createAppWindow(openedAsHidden)
  global.version = process.env.NODE_ENV === 'development' ? `${process.env.npm_package_version}` : app.getVersion()
  global.platform = (process.platform === 'win32' || process.platform === 'win64') ? 'win' : 'mac'
  console.info('[App] version', global.version)
  createAutoUpdaterSub()
  if (isSquirrelFirstRun()) {
    console.info('[Update] skipping auto update check during squirrel first run')
    return
  }
  if (settings.get('settings.auto_update_app')) {
    updateProcess.checkForUpdates()
    updateProcess.createUpdateInterval()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.info('[App] window-all-closed')
    app.quit()
  }
})

app.on('before-quit', () => {
  console.info('[App] before-quit')
  willQuitApp = true
})

app.on('activate', () => {
  console.info('[App] activate')
  if (mainWindow && idToken) {
    showMainWindow()
  } else app.focus()
})

ipcMain.on('logOut', (event, data) => {
  logOut()
})

let listenerOfToken = (event, args) => {
  if (!idToken) { // if there is no idToken, then force user to login again
    hideMainWindowAndForceLogin()
    return
  }
  event.sender.send('sendIdToken', idToken)
}

ipcMain.on('getIdToken', listenerOfToken)

async function listenerOfRefreshToken (event, args) {
  await refreshTokens()
  await checkToken()
  event.sender.send('sendRefreshToken')
}

ipcMain.on('getRefreshToken', listenerOfRefreshToken)

ipcMain.on('resetFirstLogIn', () => {
  resetFirstLogInCondition()
})

ipcMain.on('client.message', function (event, data) {
  let client
  switch (data.client) {
    case 'api':
      client = backgroundAPIWindow
      break
    case 'preferences':
      client = preferencesPopupWindow
      break
    // add more if needed
  }
  if (client) {
    client.webContents.send(data.topic, data.content)
  }
})

ipcMain.on('renderer.error', (event, data) => {
  console.error('[RendererError]', data)
})
// ipcMain.on('getFileDurationRequest', async function (event, files) {
//   console.log('getFileDurationRequest')
//   event.sender.send('getFileDurationTrigger')
//   backgroundAPIWindow.webContents.send('getFileDurationTrigger', files)
// })

export default {
  createWindow,
  createLogoutWindow
}
