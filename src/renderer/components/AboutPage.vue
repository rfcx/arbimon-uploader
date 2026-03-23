<template>
  <div class="wrapper">
    <img class="wrapper__logo" src="~@/assets/arbimon-logo.png">
    <div class="wrapper__title">Arbimon Uploader</div>
    <div class="wrapper__version" v-if="version">Version {{version}}</div>
    <div class="wrapper__version is-size-7">{{getEnv()}}</div>
  </div>
</template>

<script>
  import settings from '../services/settings'
  import remote from '../services/remote'

  export default {
    data () {
      return {
        version: this.getVersion()
      }
    },
    methods: {
      getVersion () {
        return remote.getGlobal('version')
      },
      getEnv () {
        return settings.get('settings.production_env') ? '' : '(staging)'
      }
    }
  }
</script>

<style lang="scss" scoped>
  .wrapper {
    text-align: center;
    margin: auto;
    padding: 20px;
    overflow: hidden !important;
    &__logo {
      margin-top: 10px;
      height: 50px;
    }
    &__title {
      font-size: $default-font-size;
      margin: 5px auto;
    }
    &__version {
      font-size: 12px;
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
