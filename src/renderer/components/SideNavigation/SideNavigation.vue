<template>
    <aside class="column menu side-menu side-menu-column wrapper" v-infinite-scroll="loadMore" infinite-scroll-distance="10" :infinite-scroll-disabled="isFetching">
    <div class="wrapper__header">
      <div class="wrapper__logo">
        <router-link to="/"><img src="~@/assets/arbimon-logo.png" alt="rfcx" class="icon-logo"></router-link>
        <span class="is-size-7">{{ !isProductionEnv() ? 'staging' : '' }}</span>
      </div>
      <div class="wrapper__user-pic" v-click-outside="hide" @click="toggleUserMenu()">
        <div title="Menu" v-bind:style="{'background-image': 'url(' + (getUserPicture() || require('../../assets/ic-profile-temp.svg')) + ')'}" class="user-pic"></div>
      </div>
    </div>
    <div class="wrapper__stat" v-if="showUserMenu">
      <div class="wrapper__user-name">
        <span>{{ userName }}</span>
        <button class="button is-small is-rounded" @click.prevent="showPopupToLogOut()">Log out</button>
      </div>
    </div>
    <div class="menu-container wrapper__controls">
      <button type="button" class="button is-rounded rounded-button" @click="goToImportFiles">
        <span>+</span>Import Files
      </button>
    </div>
    <div class="wrapper__title" v-if="streams && streams.length > 0">
      <span>
        Recent Uploads
      </span>
    </div>
    <div v-if="toggleSearch" class="wrapper__search" :class="{ 'search-wrapper_red': isRequiredSymbols }">
      <input type="text" class="input wrapper__input" placeholder="Filter" v-model="searchStr"
        @keyup="onKeyUp($event)" ref="searchStream">
      <button title="Remove search text" class="btn-remove" @click="onRemoveSearchText()"
        :class="{ 'btn-remove-active': searchStr }">
        <img src="~@/assets/ic-remove.svg">
      </button>
    </div>
    <ul>
      <li v-for="stream in streams" :key="stream.id">
        <div class="wrapper__stream-row" v-on:click="selectItem(stream)" :class="{'wrapper__stream-row_active': isActive(stream)}">
          <div class="menu-container" :class="{ 'menu-container-failed': stream.state && fileState.isError(stream.state) }">
            <div class="wrapper__stream-name">{{ stream.name }}</div>
            <div class="wrapper__stream-icon">
              <!-- show error icon next if some files are error -->
              <img :src="getStateImgUrl(errorState)" v-if="hasErrorState(stream) && getState(stream) !== errorState" class="icon-error">
              <img :src="getStateImgUrl(getState(stream))">
            </div>
          </div>
        </div>
      </li>
    </ul>
    <confirm-alert
      :title="alertTitle"
      :content="alertContent"
      confirmButtonText="Log Out"
      :isProcessing="false"
      v-if="showConfirmToLogOut"
      @onCancelPressed="hidePopupToLogOut()"
      @onConfirmPressed="logOut()"/>
  </aside>
</template>

<script>
  import { mapState } from 'vuex'
  import fileState from '../../../../utils/fileState'
  import streamHelper from '../../../../utils/streamHelper'
  import ConfirmAlert from '../Common/ConfirmAlert'
  import settings from '../../services/settings'
  import infiniteScroll from 'vue-infinite-scroll'
  import ipcRendererSend from '../../services/ipc'
  import remote from '../../services/remote'
  const { ERROR_SERVER } = fileState.state

  const DEFAULT_PAGE_SIZE = 50

  export default {
    directives: { infiniteScroll },
    data () {
      return {
        uploadingStreams: {},
        timeoutKeyboard: {},
        searchStr: '',
        mesure: '',
        showUserMenu: false,
        toggleSearch: false,
        showConfirmToLogOut: false,
        userName: this.getUserName(),
        userSites: [],
        isFetching: false,
        alertTitle: 'Are you sure you would like to continue?',
        alertContent: 'If you log out, you will lose all files and site info you have added to this app. They will not be deleted from Arbimon or Explorer.',
        streams: [],
        fetchStreamsInterval: null
      }
    },
    components: {
      ConfirmAlert
    },
    computed: {
      ...mapState({
        selectedStreamId: state => state.AppSetting.selectedStreamId,
        currentUploadingSessionId: state => state.AppSetting.currentUploadingSessionId,
        isUploadingProcessEnabled: state => state.AppSetting.isUploadingProcessEnabled
      }),
      selectedStream () {
        if (!Array.isArray(this.streams)) return null
        return this.streams.find(s => s.id === this.selectedStreamId)
      },
      isRequiredSymbols () {
        return this.searchStr && this.searchStr.length > 0 && this.searchStr.length < 3
      },
      errorState () {
        return ERROR_SERVER
      }
    },
    methods: {
      async ensureSelectedStream () {
        if (!Array.isArray(this.streams) || this.streams.length <= 0) {
          return
        }

        const hasSelectedStream = this.streams.some(stream => stream.id === this.selectedStreamId)
        if (hasSelectedStream) {
          return
        }

        await this.$store.dispatch('setSelectedStreamId', this.streams[0].id)
      },
      toggleUserMenu () {
        this.showUserMenu = !this.showUserMenu
      },
      hide: function (e) {
        this.showUserMenu = false
      },
      getUserName () {
        let userName = remote.getGlobal('firstname')
        if (userName) return userName
        else return 'Awesome'
      },
      getUserPicture () {
        let userPicture = remote.getGlobal('picture')
        if (userPicture) return userPicture
        else return require(`../../assets/ic-profile-temp.svg`)
      },
      logOut () {
        this.$electron.ipcRenderer.send('logOut')
      },
      onFocusInput () {
        this.toggleSearch = !this.toggleSearch
        setTimeout(() => {
          if (this.toggleSearch) {
            this.$refs.searchStream.focus()
          }
        }, 0)
        if (!this.toggleSearch && this.searchStr === '') {
          return
        }
        if (!this.toggleSearch && this.searchStr !== '') {
          this.onRemoveSearchText()
        }
      },
      onRemoveSearchText () {
        this.searchStr = ''
        // TODO: show all streams
      },
      onKeyUp (event) {
        if ([13, 37, 38, 39, 40].includes(event.keyCode)) { return }
        if (event.keyCode === 8 && this.searchStr.length < 3) {
          // TODO: show all streams
          return
        }
        if (this.timeoutKeyboard) { clearTimeout(this.timeoutKeyboard) }
        this.timeoutKeyboard = setTimeout(() => {
          if (this.searchStr.length >= 3) {
            // TODO: find a stream
          }
        }, 500)
      },
      goToImportFiles () {
        this.$router.push({path: '/import'})
      },
      getStateImgUrl (state) {
        if (state === '') return ''
        const iconName = fileState.getIconName(state)
        return require(`../../assets/${iconName}`)
      },
      async selectItem (stream) {
        await this.$store.dispatch('setSelectedStreamId', stream.id)
      },
      isActive (stream) {
        if (!stream || !this.selectedStream) return false
        return stream.id === this.selectedStream.id
      },
      getState (stream) {
        return streamHelper.getState(stream)
      },
      hasErrorState (stream) {
        return streamHelper.hasErrorState(stream)
      },
      showPopupToLogOut () {
        this.showConfirmToLogOut = true
      },
      hidePopupToLogOut () {
        this.showConfirmToLogOut = false
      },
      isProductionEnv () {
        return settings.get('settings.production_env')
      },
      async reloadStreamListFromLocalDB () {
        const limit = (this.streams.length > 0 && this.streams.length > DEFAULT_PAGE_SIZE) ? this.streams.length : DEFAULT_PAGE_SIZE
        const streams = await ipcRendererSend('db.streams.getStreamWithStats', `db.streams.getStreamWithStats.${Date.now()}`, { limit: limit, offset: 0 })
        this.streams = Array.isArray(streams) ? streams : []
        await this.ensureSelectedStream()
        this.$emit('update:getStreamList', this.streams)
      },
      async loadMore () {
        console.info('[SideNav] load more')
        const mergeById = (oldArray, newArray) => {
          if (oldArray.length <= 0) return newArray
          const updatedItems = oldArray.map(item => {
            const obj = newArray.find(o => o.id === item.id)
            return { ...item, ...obj }
          })
          const newItems = newArray.filter(o1 => !oldArray.some(o2 => o1.id === o2.id))
          return updatedItems.concat(newItems)
        }
        const currentStreams = this.streams
        const newStreams = await ipcRendererSend('db.streams.getStreamWithStats', `db.streams.getStreamWithStats.${Date.now()}`, { limit: DEFAULT_PAGE_SIZE, offset: currentStreams.length })
        if (!Array.isArray(newStreams)) {
          return
        }
        this.streams = mergeById(currentStreams, newStreams)
        await this.ensureSelectedStream()
      },
      startStreamFetchingInterval () {
        console.info('[SideNav] startStreamFetchingInterval')
        this.fetchStreamsInterval = setInterval(async () => {
          await this.reloadStreamListFromLocalDB()
        }, 2000)
      },
      stopStreamFetchingInterval () {
        if (this.fetchStreamsInterval) {
          setTimeout(() => { // fetch 1 last time to get the complete state
            console.info('[SideNav] stopStreamFetchingInterval: stop')
            clearInterval(this.fetchStreamsInterval)
            this.fetchStreamsInterval = null
          }, 2000)
        }
      },
      manageStreamFetchingInterval (currentUploadingSessionId, isUploadingProcessEnabled) {
        console.info('[SideNav] manageStreamFetchingInterval', currentUploadingSessionId, isUploadingProcessEnabled)
        if (currentUploadingSessionId && isUploadingProcessEnabled) this.startStreamFetchingInterval()
        else this.stopStreamFetchingInterval()
      }
    },
    watch: {
      currentUploadingSessionId (val, oldVal) {
        if (val === oldVal) return
        this.manageStreamFetchingInterval(val, this.isUploadingProcessEnabled)
      },
      isUploadingProcessEnabled (val, oldVal) {
        if (val === oldVal) return
        this.manageStreamFetchingInterval(this.currentUploadingSessionId, val)
      }
    },
    async created () {
      try {
        await this.reloadStreamListFromLocalDB()
      } catch (error) {
        console.error('[SideNav] failed to load streams', error)
        this.streams = []
      }
      this.manageStreamFetchingInterval(this.currentUploadingSessionId, this.isUploadingProcessEnabled)
      if (remote.getGlobal('firstLogIn')) {
        this.$electron.ipcRenderer.send('resetFirstLogIn')
      }
    },
    beforeDestroy () {
      this.stopStreamFetchingInterval()
    }
  }
</script>

<style lang="scss" scoped>
  .wrapper {
    &__stream-row:hover,
    &__stream-row_active {
      background-color: $util-gray-03;
      cursor: pointer;
    }
    &__stream-row {
      padding: 9px $default-padding 8px;
      height: 42px;
      &_active {
        font-weight: $title-font-weight;
      }
      .menu-container {
        height: 25px;
        align-items: center;
      }
    }
    &__header {
      padding: 0 12px 0 $default-padding;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 37px;
    }
    &__user-pic {
      cursor: pointer;
      margin-left: auto;
      height: 32px;
      width: 32px;
    }
    &__logo {
      margin-right: 10px;
      height: 37px;
      cursor: pointer;
      img {
        height: 37px;
        width: auto;
      }
    }
    &__stat {
      padding: 0 8px 0  16px;
      margin-bottom: 16px;
      line-height: 1.29;
      letter-spacing: 0.2px;
      animation-duration: 4s;
      animation-delay: 2s;
    }
    &__user-name {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    &__controls {
      padding: 0 8px;
      a {
        width: $full-width;
      }
    }
    &__title {
      padding: 24px $default-padding 10px;
      font-size: 16px;
      font-style: normal;
      line-height: normal;
      color: $white-color !important;
      margin: 0 !important;
      align-self: center;
      font-weight: $title-font-weight;
      text-transform: none;
      letter-spacing: 0.2px;
      display: flex;
      justify-content: space-between;
    }
    &__search {
      border-radius: 3px;
      border: solid 1px $white-color;
      display: inline-block;
      vertical-align: middle;
      width: 98%;
      padding: 0 5px;
      margin-bottom: 7px;
      height: 29px;
      line-height: normal;
      &_red {
        border: solid 1px red;
      }
    }
    &__input {
      display: inline-block;
      vertical-align: top;
      width: 87%;
      height: 27px;
      padding: 0 0 1px 0px;
      font-family: $family-sans-serif;
      font-size: 13px;
      background-color: $side-menu-background;
      color: $white-color;
      border: none;
      box-shadow: none;
    }
    &__stream-name {
      text-overflow: ellipsis;
      overflow: hidden;
      margin-right: 3px;
      align-self: center;
    }
    &__stream-icon {
      display: flex;
      width: 24px;
      justify-content: center;
      img {
        max-width: 24px;
      }
    }
    &__loader {
      display: inline-block;
      margin: 0 4px;
    }
  }
  .rounded-button {
    span {
      margin-right: 10px;
      font-size: 20px;
    }
  }
  .icon-logo {
    &:hover,
    &:focus {
      text-decoration: none;
      border: none;
      outline: none;
    }
  }
  .user-pic {
    border-radius: 50%;
    height: 100%;
    max-width: $full-height;
    max-height: $full-height;
    background-repeat: no-repeat;
    background-position: center center;
    background-size: 100% 100%;
    background-color: $util-gray-04
  }
  .menu-container {
    display: flex;
    justify-content: space-between;
    align-self: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu-container svg {
    margin-left: auto !important;
    margin-right: 3px;
  }
  .menu-container-failed {
    margin-right: 4px;
  }
  .menu-container-failed img {
    width: 16px !important;
    height: 16px !important;
    margin: 5px 0;
  }
  .btn-remove {
    background-color: transparent;
    border: none !important;
    color: $white-color;
    text-align: right;
    opacity: 0.2;
    padding: 0;
    width: 10%;
    line-height: 1.6;
    margin-top: 7px;
    cursor: pointer;
    img {
      width: 12px;
      height: 12px;
    }
  }
  .btn-remove-active {
    opacity: 1;
  }
  .drop-hover {
    background-color: transparent !important;
  }
  .iconRedo {
    color: grey;
    font-size: 13px;
    cursor: pointer;
    margin: 6px 6px 6px 0;
  }
  .icon-error {
    margin-right: 4px;
  }
  input[type="text"]::-webkit-input-placeholder {
    color: $input-placeholder !important;
    opacity: 1;
  }
  .button {
    &:focus {
      color: $button-hover-color;
      border-color: $button-hover-border-color;
    }
  }
  .button.is-small.is-rounded {
    color: $brand-primary !important;
    background-color: transparent !important;
    font-weight: 500 !important;
    border-color: $brand-primary !important;
  }
  :-ms-input-placeholder {
    color: $input-placeholder;
  }
  ::-moz-placeholder {
    color: $input-placeholder;
  }
  :-moz-placeholder {
    color: $input-placeholder;
  }
</style>
