import Vue from 'vue'
import axios from 'axios'
import 'bulma/css/bulma.css'

import App from './App'
import router from './router'
import store from './store'
import file from './services/file'
import constPlugin from './services/Constants'
import firebase from 'firebase/app'
import 'firebase/performance'

import { library } from '@fortawesome/fontawesome-svg-core'
import { faChevronUp, faChevronDown, faPencilAlt, faRedo, faEyeSlash, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
const log = require('electron-log')
const { ipcRenderer } = require('electron')

function serializeRendererArg (arg) {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack
    }
  }
  return arg
}

function reportRendererError (label, ...args) {
  console.error(label, ...args)
  log.error(label, ...args)

  try {
    ipcRenderer.send('renderer.error', {
      label,
      args: args.map(serializeRendererArg)
    })
  } catch (error) {
    console.error('[Renderer][IPC]', error)
    log.error('[Renderer][IPC]', error)
  }
}

const firebaseConfig = {
  apiKey: 'AIzaSyCfEDNKPWom20xfv69v-YHuT1XzwPg8B_g',
  authDomain: 'rfcx-ingest-257610.firebaseapp.com',
  databaseURL: 'https://rfcx-ingest-257610.firebaseio.com',
  projectId: 'rfcx-ingest-257610',
  storageBucket: 'rfcx-ingest-257610.appspot.com',
  messagingSenderId: '245204209562',
  appId: '1:245204209562:web:93bcf78069d63042463423'
}
try {
  firebase.initializeApp(firebaseConfig)
  if (typeof firebase.performance === 'function') {
    firebase.performance()
  }
} catch (error) {
  reportRendererError('[Renderer][Firebase]', error)
}

library.add(faChevronUp, faChevronDown, faPencilAlt, faRedo, faEyeSlash, faExternalLinkAlt)

if (!process.env.IS_WEB) {
  try {
    Vue.use(require('vue-electron'))
  } catch (error) {
    reportRendererError('[Renderer][VueElectron]', error)
  }
}

Vue.http = Vue.prototype.$http = axios
Vue.config.productionTip = false
Vue.config.devtools = process.env.NODE_ENV !== 'production'
Vue.config.errorHandler = (error, vm, info) => {
  reportRendererError('[Renderer][Vue]', info, error)
}

window.addEventListener('error', (event) => {
  reportRendererError('[Renderer][Window]', event.message, event.error)
})

window.addEventListener('unhandledrejection', (event) => {
  reportRendererError('[Renderer][Promise]', event.reason)
})

Vue.component('fa-icon', FontAwesomeIcon)
Vue.directive('click-outside', {
  bind: function (el, binding, vNode) {
    // Provided expression must evaluate to a function.
    if (typeof binding.value !== 'function') {
      const compName = vNode.context.name
      let warn = `[Vue-click-outside:] provided expression '${binding.expression}' is not a function, but has to be`
      if (compName) { warn += `Found in component '${compName}'` }
      console.warn(warn)
    }
    // Define Handler and cache it on the element.
    const bubble = binding.modifiers.bubble
    const hand = (e) => {
      if (bubble || (!el.contains(e.target) && el !== e.target)) {
        binding.value(e)
      }
    }
    el.__vueClickOutside__ = hand
    // add Event Listeners.
    document.addEventListener('click', hand)
  },
  unbind: function (el, binding) {
    // Remove Event Listeners.
    document.removeEventListener('click', el.__vueClickOutside__)
    el.__vueClickOutside__ = null
  }
})

Vue.$file = file
Vue.use(constPlugin)
Object.defineProperty(Vue.prototype, '$file', {
  get () {
    return file
  }
})

/* eslint-disable no-new */
new Vue({
  components: { App },
  router,
  store,
  file,
  template: '<App/>'
}).$mount('#app')
