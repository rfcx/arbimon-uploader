<template>
  <div id="wrapper-landing-page" :class="{ 'drag-active': isDragging }" @dragenter="handleDrag" @dragover.prevent="onDragOver" @drop.prevent="handleDrop" @dragleave="outDrag">
    <!-- <section class="main-content columns is-mobile"> -->
      <side-navigation ref="sideNavigation"
        :class="{ 'side-menu__with-progress': shouldShowProgress}"
        :getStreamList.sync="streams"
      />
      <div class="column content is-desktop">
        <empty-view v-if="isEmptyStream" :isEmptyStream="isEmptyStream"></empty-view>
        <file-container ref="fileContainer" v-else :isDragging="isDragging" @onImportFiles="handleFiles" @onNeedResetStreamList="resetStreamList"></file-container>
      </div>
    <!-- </section> -->
    <global-progress ref="globalProgress"></global-progress>
    <confirm-alert
      :title="alertTitle"
      :content="alertContent"
      cancelButtonText="OK"
      :image="'arbimon-logo.png'"
      :isProcessing="false"
      v-if="isPopupOpened"
      @onCancelPressed="cancel()"/>
  </div>
</template>

<script>
  import GlobalProgress from './SideNavigation/GlobalProgress'
  import SideNavigation from './SideNavigation/SideNavigation'
  import EmptyView from './LandingPage/EmptyView'
  import FileContainer from './LandingPage/FileContainer/FileContainer'
  import fileHelper from '../../../utils/fileHelper'
  import ConfirmAlert from './Common/ConfirmAlert'
  import { mapState } from 'vuex'
  import { createAnalytics } from '../services/analytics'
  import env from '../../../env.json'
  import remote from '../services/remote'
  const log = require('electron-log')
  console.log = log.log
  console.info = log.info

  export default {
    name: 'landing-page',
    components: { SideNavigation, EmptyView, FileContainer, GlobalProgress, ConfirmAlert },
    data () {
      return {
        alertTitle: 'You are up to date',
        alertContent: this.getAlertContent(),
        isDragging: false,
        isPopupOpened: false,
        streams: []
      }
    },
    methods: {
      outDrag (e) {
        // FIX dropleave event
        // e.preventDefault()
        this.isDragging = false
      },
      handleDrag (e) {
        this.isDragging = true
      },
      onDragOver (e) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      async handleDrop (e) {
        e.preventDefault()
        let files = []
        const t0 = performance.now()
        console.info('e.dataTransfer.files', e.dataTransfer.files)
        let pathFromData = e.dataTransfer.getData('FileNameW') || e.dataTransfer.getData('FileName') || e.dataTransfer.getData('text/plain')
        if (pathFromData && pathFromData.includes('\n')) {
          pathFromData = pathFromData.split('\n')[0].trim()
        }
        console.info('Path from DataTransfer candidate:', pathFromData)

        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i]
            if (!file.path && pathFromData && e.dataTransfer.files.length === 1) {
              console.info('Recovering path for file:', pathFromData)
              file.path = pathFromData
            }
            files.push(file)
          }
        } else if (e.dataTransfer.items && e.dataTransfer.items.length) {
          console.info('Using items fallback, length:', e.dataTransfer.items.length)
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i]
            if (item.kind === 'file') {
              const file = item.getAsFile()
              if (file) {
                if (!file.path && pathFromData && e.dataTransfer.items.length === 1) {
                  console.info('Recovering path for item:', pathFromData)
                  file.path = pathFromData
                }
                files.push(file)
              }
            }
          }
        }
        this.isDragging = false
        if (!files.length) {
          console.warn('No files dropped')
          return
        }
        console.log('Dropped:', files.map(f => `${f.name} (path: ${f.path})`))
        await this.handleFiles(files)
        const t1 = performance.now()
        console.info('[Landing] ⏱ handleDrop ' + (t1 - t0) + ' ms')
      },
      async handleFiles (files) {
        const fileObjects = files.map(file => {
          return {
            'lastModified': file.lastModified,
            'lastModifiedDate': file.lastModifiedDate,
            'name': file.name,
            'size': file.size,
            'type': file.type,
            'path': file.path
          }
        })
        const firstPath = fileObjects[0].path
        const isFolderCheck = (filePath) => {
          return fileHelper.isFolder(filePath)
        }
        let isFolder = isFolderCheck(firstPath)
        console.info('isFolder', isFolder, 'firstPath', firstPath)
        const query = { currentActiveSite: JSON.stringify(this.selectedStream) }
        if (isFolder) {
          query.folderPath = fileObjects[0].path
          console.info('fileObjects[0].path', fileObjects[0].path)
        } else {
          query.selectedFiles = JSON.stringify(fileObjects)
        }
        this.$router.push({path: '/select-site', query: query})
      },
      async sendVersionOfApp () {
        let version = remote.getGlobal('version')
        let guid = remote.getGlobal('userId')
        const analytics = createAnalytics(env.analytics.id, { appName: env.analytics.appName, appVersion: `${version}`, clientId: `${guid}` })
        await analytics.send('screenview', { cd: `${guid}`, 'an': env.analytics.appName, 'av': `${version}`, 'cid': `${guid}` })
        await analytics.send('event', { ec: `${guid}`, 'ea': `${new Date().toLocaleString()}`, 'an': env.analytics.appName, 'av': `${version}`, 'cid': `${guid}` })
      },
      cancel () {
        this.isPopupOpened = false
      },
      getAlertContent () {
        return `You are on the latest version ${remote.getGlobal('version')}`
      },
      async resetStreamList () {
        await this.$refs.sideNavigation.reloadStreamListFromLocalDB()
      }
    },
    computed: {
      ...mapState({
        selectedStreamId: state => state.AppSetting.selectedStreamId,
        currentUploadingSessionId: state => state.AppSetting.currentUploadingSessionId
      }),
      selectedStream () {
        return this.$refs.fileContainer && this.$refs.fileContainer.selectedStream
      },
      shouldShowProgress () {
        return this.$refs.globalProgress && this.$refs.globalProgress.shouldShowProgress
      },
      isEmptyStream () {
        return this.streams === undefined || this.streams.length === 0
      }
    },
    async created () {
      let html = document.getElementsByTagName('html')[0]
      html.style.overflowY = 'auto'
      try {
        await this.sendVersionOfApp()
      } catch (error) {
        console.info('[Landing] failed to send analytics', error)
      }
      this.$electron.ipcRenderer.on('showUpToDatePopup', (event, shouldDisplayUpToDatePopup) => {
        this.isPopupOpened = shouldDisplayUpToDatePopup
      })
      this.$electron.ipcRenderer.on('onClearAllData', async (event, message) => {
        await this.$store.dispatch('reset')
        await this.$refs.sideNavigation.reloadStreamListFromLocalDB()
      })
    }
  }
</script>

<style lang="scss">

  #wrapper-landing-page {
    padding: 0;
    position: absolute;
    top: $navbar-height;
    bottom: 0;
    left: 0;
    right: 0;
    overflow: auto;
    overflow-y: auto;
  }

  .main-content {
    padding: 0 $default-padding-margin;
  }

  .column {
    overflow-y: auto;
  }

  .side-menu {
    flex: none;
    width: $sidebar-width !important;
    padding: 0 !important;
    margin-right: $default-padding-margin;
    top: $navbar-height;
    bottom: 0;
    position: absolute;
    &__with-progress {
      margin-bottom: $global-progress-height;
    }
  }

  .side-menu-column {
    padding-top: 20px !important;
  }

  aside {
    background-color: $side-menu-background;
  }

  .content {
    position: absolute;
    top: $navbar-height;
    padding: 0 !important;
    bottom: 0;
    left: $sidebar-width;
    right: 0;
  }

  ::-webkit-scrollbar {
    width: 4px;
  }

  ::-webkit-scrollbar-thumb {
    background: $grey-lighter;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: $grey-lighter;
  }

  .progress {
    margin: 4px auto !important;
    height: 3px !important;
  }

  .state-progress span {
    color: $body-text-color;
  }

  a.is-circle {
    background-color: transparent;
    border-color: transparent;
    border-radius: 50%;
    margin: auto;
    text-align: center;
    padding: 0 0 0 3px !important;
    margin: 0 0 0 1px !important;
    &:active,
    &:hover,
    &:focus {
      border-color: transparent !important;
    }
    .img-open-folder {
      height: 25px !important;
      width: 25px !important;
      padding: 0 !important;
    }
  }

  .field {
    margin-bottom: 1rem !important;
  }

  .button.is-primary {
    font-weight: $title-font-weight;
  }

  .uploading-process-status {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 20px;
    text-align: center;
    background-color: $progress-bar-background-color;
    font-size: $default-font-size;
  }

  .alert .modal-card-body {
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
  }

  .dropdown {
    &__wrapper {
      top: 95px;
      left: 1.5em;
      border: 1px solid rgba($divider-color, 0.5);
    }
    &__menu {
      width: 220px;
    }
    &__content {
      border: 1px solid rgba($divider-color, 0.5);
    }
  }

  a.dropdown-item {
    font-size: $default-font-size;
    padding: 0.75rem 1rem;
  }

  @media screen and (min-width: 400px) {

    .navbar-end {
      justify-content: flex-end;
      margin-left: auto;
    }

    .navbar, .navbar-menu, .navbar-start, .navbar-end {
      align-items: stretch;
      display: flex;
    }

    .navbar-item {
      display: flex;
    }
  }

  .active {
    border: 4px solid #060508 !important;
    background-color: #060508 !important;
    opacity: 0.8 !important;
  }
  .empty {
    background-color: #060508 !important;
  }
  .state-progress span {
    color: $body-text-color;
  }
  ::-webkit-scrollbar-thumb {
    background-color: gray;
  }
  ::-webkit-scrollbar-track {
    background-color: #52566e;
  }
  ::-webkit-scrollbar {
    width: 6px;
  }

  .drag-active {
    border: 2px solid #cac5c5 !important;
    opacity: 0.5 !important;
  }

</style>
