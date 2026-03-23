import dbService from '../../../services/db/sqlite'
import { enableRemoteForWindow, getRendererWebPreferences } from '../../../services/window-preferences'
const { app, BrowserWindow, ipcMain } = require('electron')

function broadcastToRenderers (topic, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window || window.isDestroyed()) {
      return
    }

    window.webContents.send(topic, payload)
  })
}

export default {
  async createWindow () {
    console.info('[DBWindow] createWindow')
    const dbURL = process.env.NODE_ENV === 'development' ? `http://localhost:9080/static/empty.html` : `file://${__dirname}/static/empty.html`
    const dbWindow = new BrowserWindow({
      show: false,
      webPreferences: getRendererWebPreferences({ backgroundThrottling: true })
    })
    enableRemoteForWindow(dbWindow)
    dbWindow.loadURL(dbURL)

    await dbService.init(app)

    // Monitor process
    dbWindow.webContents.on('crashed', (event, killed) => {
      console.error('💥 dbWindow on crashed event:', event)
      setTimeout(() => { // delay to prevent app crash https://github.com/electron/electron/issues/23291
        dbWindow.reload()
      }, 5000)
    })

    Object.keys(dbService.collections).forEach((collection) => {
      Object.keys(dbService.collections[collection]).forEach((method) => {
        const topic = `db.${collection}.${method}`
        ipcMain.on(topic, async function (event, callbackTopic, data) {
          try {
            const result = await dbService.collections[collection][method](data)
            event.sender.send(callbackTopic, result)

            if (collection === 'files' && ['bulkCreate', 'update', 'bulkUpdate', 'delete'].includes(method)) {
              broadcastToRenderers('db.files.changed', {
                method,
                data
              })
            }
          } catch (e) {
            console.error('Failed to call db method', e)
            event.sender.send(callbackTopic, {
              message: e && e.message ? e.message : 'Unknown database error',
              stack: e && e.stack ? e.stack : null,
              code: e && e.code ? e.code : null
            })
          }
        })
      })
    })

    return dbWindow
  }
}
