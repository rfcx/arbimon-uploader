import Vue from 'vue'
import Vuex from 'vuex'
import VuexORM from '@vuex-orm/core'
import modules from './modules'
import { createPersistedState, createSharedMutations } from './plugins/persistence'

Vue.use(Vuex)

// Create a new database instance.
const database = new VuexORM.Database()

export default new Vuex.Store({
  modules,
  plugins: [
    VuexORM.install(database),
    createPersistedState(),
    createSharedMutations()
  ],
  strict: process.env.NODE_ENV !== 'production'
})
