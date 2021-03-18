import { app, remote, ipcMain, BrowserWindow, autoUpdater } from 'electron'
import settings from 'electron-settings'
const os = require('os')

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
      backgroundColor: '#131525',
      titleBarStyle: 'default',
      webPreferences: { nodeIntegration: true }
    })

    updatePopupWindow.removeMenu()
    updatePopupWindow.loadURL(updateURL)

    updatePopupWindow.on('closed', () => {
      console.log('updatePopupWindow closed')
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
      autoUpdater.setFeedURL(updaterFeedURL)
      autoUpdater.on('error', message => {
        console.error('There was a problem updating the application', message)
      })
      autoUpdater.on('checking-for-update', () => console.log('checking-for-update'))
      autoUpdater.on('update-available', () => { console.log('update-available') })
      autoUpdater.on('update-not-available', () => {
        console.log('update-not-available')
        updateNotAvaliableHandler()
      })
      autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
        console.log('update-downloaded', releaseName, releaseNotes)
        if (releaseName) global.newVersion = releaseName
        if (releaseNotes) global.notes = releaseNotes
        const currentURL = remote.getCurrentWindow().webContents.getURL()
        if (currentURL && currentURL === this.updateURL) { return }
        this.createWindow(true, startUpdateAppHandler)
      })
    } catch (e) {
      console.error('Can not set feed url', e)
    }
  },
  checkForUpdates () {
    console.log('auto update process: checkForUpdates')
    autoUpdater.checkForUpdates()
  },
  createUpdateInterval () {
    console.log('auto update process: createUpdateInterval')
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
