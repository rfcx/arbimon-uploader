'use strict'

import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import '../renderer/store'
import Stream from '../renderer/store/models/Stream'
import File from '../renderer/store/models/File'
import path from 'path'
// import API from '../../utils/api'

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
  global.__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
}

let mainWindow, backgroundAPIWindow, backgroundFSWindow
let menu, tray
const winURL = process.env.NODE_ENV === 'development'
  ? `http://localhost:9080`
  : `file://${__dirname}/index.html`

const backgroundAPIURL = process.env.NODE_ENV === 'development'
  ? `http://localhost:9080/#/api-service`
  : `file://${__dirname}/index.html#/api-service`

const backgroundFSURL = process.env.NODE_ENV === 'development'
  ? `http://localhost:9080/#/fs-service`
  : `file://${__dirname}/index.html#/fs-service`

function createWindow (openedAsHidden = false) {
  /**
   * Initial window options
   */
  createMenu()
  mainWindow = new BrowserWindow({
    show: !openedAsHidden,
    useContentSize: true,
    width: 1000,
    height: 563,
    minWidth: 400,
    webPreferences: { nodeIntegration: true }
  })

  mainWindow.loadURL(winURL)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  backgroundAPIWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true }
  })
  backgroundAPIWindow.loadURL(backgroundAPIURL)

  backgroundFSWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true }
  })
  backgroundFSWindow.loadURL(backgroundFSURL)
}

function createMenu () {
  /* MENU */
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Clear data',
          click: async () => {
            console.log('clear data')
            File.deleteAll()
            Stream.deleteAll()
          }
        },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' }
      ]
    }
  ]
  menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createTray () {
  const iconPath = path.join(__static, 'rfcx-logo.png')
  var trayIcon = nativeImage.createFromPath(iconPath)
  trayIcon = trayIcon.resize({ width: 12, height: 17 })
  tray = new Tray(trayIcon)
  const trayMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: function () {
        if (mainWindow === null) {
          createWindow()
        } else {
          mainWindow.show()
        }
      }
    },
    {
      label: 'Quit',
      click: function () {
        app.isQuiting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(trayMenu)
}

// const appFolder = path.dirname(process.execPath)
// const updateExe = path.resolve(appFolder, '..', 'Update.exe')
// const exeName = path.basename(process.execPath)

app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: true,
  // path: updateExe,
  args: [
    // '--processStart', `"${exeName}"`,
    '--process-start-args', `"--hidden"`
  ]
})

app.on('ready', () => {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'
  let openedAsHidden = false
  if (process.platform === 'darwin') openedAsHidden = app.getLoginItemSettings().wasOpenedAsHidden
  else openedAsHidden = (process.argv || []).indexOf('--hidden') !== -1
  console.log('open as hidden', openedAsHidden)
  createTray()
  createWindow(openedAsHidden)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  } else {
    mainWindow.show()
  }
})

/**
 * Auto Updater
 *
 * Uncomment the following code below and install `electron-updater` to
 * support auto updating. Code Signing with a valid certificate is required.
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-electron-builder.html#auto-updating
 */

/*
import { autoUpdater } from 'electron-updater'

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') autoUpdater.checkForUpdates()
})
 */
