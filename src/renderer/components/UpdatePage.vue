<template>
  <div class="wrapper">
    <div class="wrapper__title-wrapper">
     <span class="wrapper__title">{{ newVersion ? 'Update Available' : 'You use Latest Release'}}</span>
    </div>
    <div class="wrapper__content-wrapper">
      <div class="wrapper__version" v-if="newVersion">{{ newVersion }} (Latest)</div>
      <div class="wrapper__version" v-if="!newVersion"></div>
      <div class="wrapper__notes">
        <vue-markdown v-if="notes">{{notes}}</vue-markdown>
      </div>
      <div class="wrapper__controls">
        <button class="button is-rounded is-cancel btn" @click="cancel()">{{ platform === 'mac' ? 'Cancel' : 'Install on quit' }}</button>
        <button class="button is-rounded is-primary btn" :class="{ 'is-loading': isLoading }" :disabled="!newVersion" @click="update()">Update now</button>
      </div>
    </div>
  </div>
</template>

<script>
  import VueMarkdown from 'vue-markdown'
  import remote from '../services/remote'

  export default {
    data () {
      return {
        notes: null,
        platform: null,
        isLoading: false
      }
    },
    components: { VueMarkdown },
    computed: {
      newVersion () {
        return remote.getGlobal('newVersion')
      }
    },
    methods: {
      getNotes () {
        this.notes = remote.getGlobal('notes')
      },
      cancel () {
        this.$electron.ipcRenderer.send('closeUpdatePopupWindow')
      },
      update () {
        this.isLoading = true
        this.$electron.ipcRenderer.send('updateVersion')
      }
    },
    created () {
      this.platform = remote.getGlobal('platform')
      this.getNotes()
    }
  }
</script>

<style lang="scss" scoped>
  .wrapper {
    margin: auto;
    overflow: hidden;
    &__title-wrapper {
      padding: 10px 1em 10px;
      opacity: 0.5;
    }
    &__title {
      font-size: 14px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    &__content-wrapper {
      padding: 0px 1em 5px;
    }
    &__version {
      font-size: 16px;
      font-weight: bold;
    }
    &__notes {
      font-size: 12px;
      height: 140px;
      overflow: auto !important;
    }
    &__controls {
      text-align: right;
    }
  }
</style>

<style lang="scss">
  ::-webkit-scrollbar-thumb {
    background-color: transparent;
  }
  ::-webkit-scrollbar-track {
    background-color: transparent;
  }
  ::-webkit-scrollbar {
    width: 1px;
  }
</style>
