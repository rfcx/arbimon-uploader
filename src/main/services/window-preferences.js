const remoteMain = require('@electron/remote/main')

export function getRendererWebPreferences (overrides = {}) {
  return {
    nodeIntegration: true,
    contextIsolation: false,
    sandbox: false,
    ...overrides
  }
}

export function enableRemoteForWindow (browserWindow) {
  remoteMain.enable(browserWindow.webContents)
  return browserWindow
}
