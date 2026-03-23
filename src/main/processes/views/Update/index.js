import settings from 'electron-settings'
import { enableRemoteForWindow, getRendererWebPreferences } from '../../../services/window-preferences'
const os = require('os')
const { app, ipcMain, BrowserWindow, autoUpdater } = require('electron')

let updateIntervalTimeout
let dayInMs = 60 * 60 * 24 * 1000
const updateURL = process.env.NODE_ENV === 'development' ? `http://localhost:9080/#/update` : `file://${__dirname}/index.html#/update`

export default {
  createWindow (isShow, updateAppHandler) {
    const updatePopupWindow = new BrowserWindow({
      width: 500,
      height: 300,
      show: isShow,
      frame: true,
      transparent: false,
      backgroundColor: '#060508',
      titleBarStyle: 'default',
      webPreferences: getRendererWebPreferences()
    })

    enableRemoteForWindow(updatePopupWindow)
    updatePopupWindow.removeMenu()
    updatePopupWindow.loadURL(updateURL)

    updatePopupWindow.on('closed', () => {
      updatePopupWindow.destroy()
    })

    ipcMain.on('closeUpdatePopupWindow', () => {
      console.log('closeUpdatePopupWindow')
      updatePopupWindow.destroy()
    })

    ipcMain.on('updateVersion', () => {
      autoUpdater.quitAndInstall()
      updateAppHandler()
    })

    return updatePopupWindow
  },
  createAutoUpdaterSub (updateNotAvaliableHandler, startUpdateAppHandler) {
    let platform = os.platform() + '_' + os.arch()
    const isDevelopment = process.env.NODE_ENV === 'development'
    let version = isDevelopment ? `${process.env.npm_package_version}` : app.getVersion()
    let updaterFeedURL = (isDevelopment ? 'https://localhost:3030/update/' : (settings.get('settings.production_env') ? 'https://ingest.rfcx.org/update/' : 'https://staging-ingest.rfcx.org/update/')) + platform + '/' + version
    try {
      console.info('[Update] updaterFeedURL', updaterFeedURL)
      autoUpdater.setFeedURL(updaterFeedURL)
      autoUpdater.on('error', message => {
        console.error('[Update] There was a problem updating the application', message)
      })
      autoUpdater.on('checking-for-update', () => {
        console.log('[Update] checking-for-update', autoUpdater.getFeedURL())
      })
      autoUpdater.on('update-available', () => { console.log('[Update] update-available') })
      autoUpdater.on('update-not-available', () => {
        console.info('[Update] update-not-available')
        updateNotAvaliableHandler()
      })
      autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
        console.info('[Update] update-downloaded', releaseName, releaseNotes)
        if (releaseName) global.newVersion = releaseName
        if (releaseNotes) global.notes = releaseNotes
        const currentWin = BrowserWindow.getFocusedWindow()
        const currentURL = currentWin ? currentWin.webContents.getURL() : null
        if (currentURL && currentURL === this.updateURL) { return }
        this.createWindow(true, startUpdateAppHandler)
      })
    } catch (e) {
      console.error('Can not set feed url', e)
    }
  },
  checkForUpdates () {
    console.info('[Update] auto update process: checkForUpdates')
    autoUpdater.checkForUpdates()
  },
  createUpdateInterval () {
    console.info('[Update] auto update process: createUpdateInterval')
    updateIntervalTimeout = setInterval(() => {
      this.checkForUpdates()
    }, dayInMs)
  },
  resetUpdateInterval () {
    console.log('auto update process: resetUpdateInterval')
    if (updateIntervalTimeout) {
      clearInterval(updateIntervalTimeout)
    }
  }
}
