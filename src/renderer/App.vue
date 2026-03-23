<template>
  <div id="app">
    <div class="notification is-danger is-light fixed-notice" v-if="!onLine">
      <strong>No Internet Connection</strong>
    </div>
    <router-view></router-view>
  </div>
</template>

<script>
  import settings from './services/settings'
  import { mapState } from 'vuex'
  const isOnline = require('is-online')

  export default {
    name: 'arbimon-uploader',
    data () {
      return {
        onLine: navigator.onLine
      }
    },
    mounted () {
      window.addEventListener('online', this.updateOnlineStatus)
      window.addEventListener('offline', this.updateOnlineStatus)
    },
    computed: {
      ...mapState({
        currentUploadingSessionId: state => state.AppSetting.currentUploadingSessionId
      })
    },
    methods: {
      updateOnlineStatus (e) {
        const { type } = e
        this.onLine = type === 'online'
        if (!this.onLine) {
          console.info('\nupdateOnlineStatus', this.onLine)
          settings.set('settings.onLine', this.onLine)
        } else {
          isOnline().then(online => {
            console.unfo('\nupdateOnlineStatus', online)
            settings.set('settings.onLine', online)
          })
        }
      }
    }
  }
</script>

<style>
  @import "~bulma/css/bulma.css";

  .notification.is-danger {
    background-color: #c73b57 !important;
    padding-right: 1.5rem !important;
  }

</style>
