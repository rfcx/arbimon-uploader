<template>
  <div class="wrapper">
    <div class="tabs">
      <ul>
        <li class="wrapper__tab" :class="{ 'is-active': (currentTab === 'update') }"><a @click="changeCurrentTab('update')">Update</a></li>
        <li class="wrapper__tab" :class="{ 'is-active': (currentTab === 'about') }"><a @click="changeCurrentTab('about')">About</a></li>
      </ul>
    </div>
    <div class="wrapper__content-wrapper" v-if="currentTab === 'update'">
      <div class="wrapper__content">
        <div class="wrapper__title">Check for updates automatically</div>
        <label class="checkbox wrapper__checkbox">
          <input type="checkbox" v-model="isAutoUpdateApp" v-on:click="toggleDisabled()">
          <span>Enabled</span>
        </label>
        <div class="wrapper__descr">Arbimon Uploader automatically checks for new app versions, downloads then and installs on app's restart.</div>
      </div>
    </div>
    <about-page v-if="currentTab === 'about'"></about-page>
  </div>
</template>

<script>
  import settings from '../services/settings'
  import AboutPage from './AboutPage'

  export default {
    data () {
      return {
        currentTab: 'update' | 'about',
        isAutoUpdateApp: null
      }
    },
    components: {
      AboutPage
    },
    methods: {
      changeCurrentTab (tab) {
        this.currentTab = tab
      },
      toggleDisabled () {
        this.isAutoUpdateApp = !this.isAutoUpdateApp
        settings.set('settings.auto_update_app', this.isAutoUpdateApp)
        this.$electron.ipcRenderer.send('changeAutoUpdateApp')
      }
    },
    created () {
      this.isAutoUpdateApp = settings.get('settings.auto_update_app')
      this.currentTab = 'update'
    }
  }
</script>

<style lang="scss" scoped>
  .wrapper {
    &__content-wrapper {
      padding: 0 1em 1em;
    }
    &__content {
      text-align: left;
    }
    &__title {
      font-size: 14px;
      margin-bottom: 5px;
    }
    &__checkbox {
      margin-bottom: 5px;
      &:hover,
      &:active {
        color: #fff;
      }
    }
    &__descr {
      font-size: 14px;
      margin-bottom: 10px;
      opacity: 0.5;
    }
    ::-webkit-scrollbar-thumb {
      background-color: transparent;
    }
    ::-webkit-scrollbar-track {
      background-color: transparent;
    }
    ::-webkit-scrollbar {
      width: 1px;
    }
  }
</style>
