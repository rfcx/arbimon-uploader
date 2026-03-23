import { enableRemoteForWindow, getRendererWebPreferences } from '../../../services/window-preferences'
const { BrowserWindow } = require('electron')

export default {
  createWindow (isShow, onCloseHandler, onClosedHandler) {
    console.info('[MainWindow] createWindow')
    const mainWindowURL = process.env.NODE_ENV === 'development' ? `http://localhost:9080` : `file://${__dirname}/index.html`
    const mainWindow = new BrowserWindow({
      show: isShow,
      useContentSize: true,
      width: 1000,
      height: 563,
      minWidth: 400,
      backgroundColor: '#060508',
      webPreferences: getRendererWebPreferences()
    })

    enableRemoteForWindow(mainWindow)
    mainWindow.loadURL(mainWindowURL)

    // Monitor process
    mainWindow.webContents.on('crashed', (event, killed) => {
      console.error('💥 mainWindow on crashed event:', event)
      setTimeout(() => { // delay to prevent app crash https://github.com/electron/electron/issues/23291
        mainWindow.reload()
      }, 5000)
    })

    mainWindow.on('close', (e) => {
      onCloseHandler(e)
    })

    mainWindow.on('closed', (e) => {
      onClosedHandler(e)
    })

    return mainWindow
  }
}
