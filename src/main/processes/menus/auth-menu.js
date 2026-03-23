import settings from 'electron-settings'
import sharedProcess from '../shared/index'
import sharedMenu from './shared'
const { Menu } = require('electron')

function createMenu (backToLogInFunction, quitFunction) {
  /* MENU */
  const template = [
    {
      label: 'File',
      submenu: [
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
        { label: 'Back to Login page',
          type: 'checkbox',
          click: backToLogInFunction
        },
        { label: 'Enable staging mode',
          type: 'checkbox',
          click: async (item) => {
            settings.set('settings.production_env', !item.checked)
          }
        },
        { label: 'Quit',
          click: quitFunction
        }
      ]
    },
    sharedMenu.getEditMenuTemplate()
  ]
  let menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

export default { createMenu }
