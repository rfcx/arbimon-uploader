import settings from 'electron-settings'
import sharedProcess from '../shared/index'
import sharedMenu from './shared'
import log from 'electron-log'
import fileHelper from '../../../../utils/fileHelper'
import env from '../../../../env.json'
const { app, Menu, shell, dialog, BrowserWindow } = require('electron')

function createMenu (clearDataFunction, logoutFunction, preferenceFunction, aboutFunction, updateFunction) {
  /* MENU */
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Clear data',
          click: clearDataFunction
        },
        { label: 'Auto start',
          type: 'checkbox',
          checked: settings.get('settings.auto_start'),
          click: async (item) => {
            const existingSettings = settings.get('settings')
            existingSettings['auto_start'] = item.checked
            settings.set('settings', existingSettings)
            sharedProcess.setLoginItem(item.checked)
          }
        },
        { label: 'Log out',
          type: 'checkbox',
          click: logoutFunction
        },
        { label: 'Quit',
          click: function () {
            app.exit()
            app.quit()
          }
        },
        { type: 'separator' },
        { label: 'Preferences',
          click: preferenceFunction
        },
        { label: 'Check for Updates',
          click: updateFunction
        },
        { label: 'About Arbimon Uploader',
          click: aboutFunction
        }
      ]
    },
    sharedMenu.getEditMenuTemplate(),
    {
      label: 'Help',
      submenu: [
        { label: 'Export Logs',
          click: () => {
            const currentWin = BrowserWindow.getFocusedWindow()
            dialog.showSaveDialog(currentWin, {
              title: 'Export Logs'
            }).then(result => {
              const desPath = result.filePath
              if (desPath) {
                try {
                  const file = log.transports.file.getFile()
                  const directory = fileHelper.getDirectoryFromFilePath(file.path)
                  fileHelper.archiverDirectory(directory, desPath)
                } catch (err) {
                  dialog.showErrorBox('Error', err.message)
                }
              }
            }).catch(err => {
              console.log(err)
              dialog.showErrorBox('Error', err.message)
            })
          }
        },
        { label: 'Arbimon Uploader Support',
          click: () => {
            shell.openExternal(env.supportSiteUrl)
          }
        }
      ]
    }
  ]
  let menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

export default { createMenu }
