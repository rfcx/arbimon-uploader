import settings from 'electron-settings'
import dbService from '../../services/db/sqlite'
const { app } = require('electron')

const STORE_KEY = 'vuex_state'

export default {
  setLoginItem (openAtLogin) {
    console.log('setLoginItem', openAtLogin)
    const args = openAtLogin ? ['--process-start-args', `"--hidden"`] : []
    app.setLoginItemSettings({
      openAtLogin: openAtLogin,
      openAsHidden: openAtLogin,
      args: args
    })
  },
  async clearAllData () {
    await dbService.deleteAllRecords()
    settings.delete(STORE_KEY)
  }
}
