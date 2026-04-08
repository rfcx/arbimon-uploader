<template>
    <div class="wrapper" v-infinite-scroll="loadMore" infinite-scroll-distance="10" :infinite-scroll-disabled="!infiniteScrollEnabled">
    <header-view :selectedStream="selectedStream" @onClickRefreshStream="updateStream" :isFetching="isFetchingStreamInfo"></header-view>
    <tab
        :preparingGroup="getNumberOfFilesAndStatusToRenderInTab('Prepared')"
        :queuedGroup="getNumberOfFilesAndStatusToRenderInTab('Queued')"
        :completedGroup="getNumberOfFilesAndStatusToRenderInTab('Completed')"
        :selectedTab="selectedTab"
        @onSelectTab="onSelectTab"
    ></tab>
    <file-name-format-info
        v-if="selectedTab === 'Prepared' && hasPreparingFiles"
        :numberOfReadyToUploadFiles="numberOfReadyToUploadFiles"
        :selectedStream="selectedStream"
        @onNeedResetFileList="resetFiles"
        @onNeedResetStreamList="resetStreams"
    ></file-name-format-info>
    <file-queued
        v-if="selectedTab === 'Queued' && hasFileInQueued"
        :queuedFileCount="queuedFileCount"
    ></file-queued>
    <summary-view
        v-if="selectedTab === 'Completed' && hasCompletedFiles"
        :stats="getStatsOfTab(selectedTab)"
        :retryableFileCount="retryableFileCount"
    ></summary-view>
    <file-list
        ref="fileList"
        :files="files"
        :stats="getStatsOfTab(selectedTab)"
        :hasFileInQueued="hasFileInQueued"
        :selectedTab="selectedTab"
        :isDragging="isDragging"
        :isFetching="files.length <= 0 && isFetching"
        :isLoadingMore="isFetching"
        @onImportFiles="onImportFiles"
        @onNeedResetFileList="resetFiles"
        @onSelectFolder="$emit('onSelectFolder')"
    ></file-list>
</div>
</template>

<script>
import { mapState } from 'vuex'
import HeaderView from '../HeaderView'
import Tab from './Tab'
import FileNameFormatInfo from './FileNameFormatInfo'
import FileList from './FileList'
import SummaryView from './Summary'
import FileQueued from './FileQueued.vue'
import FileState from '../../../../../utils/fileState'
import infiniteScroll from 'vue-infinite-scroll'
import ipcRendererSend from '../../../services/ipc'
import streamService from '../../../services/stream'

const fileComparator = (fileA, fileB) => {
  const stateResult = FileState.getStatePriority(fileA.state) - FileState.getStatePriority(fileB.state)
  if (stateResult !== 0) {
    return stateResult
  }
  return new Date(fileA.timestamp) - new Date(fileB.timestamp)
}

const mergeById = (oldArray, newArray) => {
  if (oldArray.length <= 0) return newArray
  const updatedItems = oldArray.map(item => {
    const obj = newArray.find(o => o.id === item.id)
    return { ...item, ...obj }
  })
  const newItems = newArray.filter(o1 => !oldArray.some(o2 => o1.id === o2.id))
  return updatedItems.concat(newItems)
}

export default {
  directives: { infiniteScroll },
  data () {
    return {
      files: [],
      stats: [],
      retryableFileCount: 0,
      queuedFileCount: 0,
      fetchFilesInterval: null,
      selectedStream: null,
      currentTab: 'Prepared',
      isFetching: false,
      isFetchingStreamInfo: false
    }
  },
  props: {
    isDragging: Boolean
  },
  components: {
    HeaderView, Tab, FileNameFormatInfo, FileList, SummaryView, FileQueued
  },
  computed: {
    ...mapState({
      selectedStreamId: state => state.AppSetting.selectedStreamId,
      currentUploadingSessionId: state => state.AppSetting.currentUploadingSessionId,
      isUploadingProcessEnabled: state => state.AppSetting.isUploadingProcessEnabled
    }),
    selectedTab () {
      return this.currentTab
    },
    persistedSelectedTab () {
      if (!this.selectedStreamId) {
        return null
      }
      return this.$store.getters.getSelectedTabByStreamId(this.selectedStreamId)
    },
    hasPreparingFiles () {
      return this.stats.find(group => FileState.isInPreparedGroup(group.state)) !== undefined
    },
    hasFileInQueued () {
      return this.stats.find(group => FileState.isInQueuedGroup(group.state)) !== undefined
    },
    hasCompletedFiles () {
      return this.stats.find(group => FileState.isInCompletedGroup(group.state)) !== undefined
    },
    numberOfReadyToUploadFiles () {
      const preparingGroup = this.stats.find(group => FileState.isPreparing(group.state))
      return preparingGroup ? preparingGroup.stateCount : 0
    },
    infiniteScrollEnabled () {
      return !this.isFetching && !this.isUploading
    },
    isUploading () {
      return this.currentUploadingSessionId && this.isUploadingProcessEnabled
    }
  },
  methods: {
    getDefaultSelectedTab () {
      if (this.selectedStream) {
        if (this.selectedStream.isUploading) return 'Queued'
        if (this.selectedStream.isCompleted) return 'Completed'
      }
      return 'Prepared'
    },
    syncSelectedTab () {
      const savedSelectedTab = this.selectedStreamId ? this.$store.getters.getSelectedTabByStreamId(this.selectedStreamId) : null
      this.currentTab = savedSelectedTab || this.getDefaultSelectedTab()
    },
    onSelectTab (tab) {
      this.currentTab = tab
    },
    async onFilesChanged () {
      if (!this.selectedStreamId || this.isFetching) {
        return
      }

      await this.getCurrentStream()
      await this.reloadStats()
      await this.reloadFiles(this.getQueryBySelectedTab(this.selectedTab), 0)
    },
    async onImportFiles (files) {
      console.info('[FileContainer] onImportFiles', files)
      this.$emit('onImportFiles', files)
    },
    async loadMore () {
      if (this.isUploading) { return } // only support pagination when not in uploading mode
      this.isFetching = true
      const offset = this.files.length
      const query = this.getQueryBySelectedTab(this.selectedTab)
      await this.reloadFiles(query, offset, true)
      this.isFetching = false
    },
    // Get files for each tab
    getQueryBySelectedTab (selectedTab) {
      let commonQuery = { streamId: this.selectedStreamId }
      switch (selectedTab) {
        case 'Prepared':
          return { ...commonQuery, state: FileState.preparedGroup }
        case 'Queued':
          return { ...commonQuery, state: FileState.queuedGroup }
        case 'Completed':
          return { ...commonQuery, state: FileState.completedGroup }
      }
    },
    getNumberOfFilesAndStatusToRenderInTab (tab) {
      let hasErrorFiles = false
      switch (tab) {
        case 'Prepared':
          hasErrorFiles = this.stats.find(group => FileState.isLocalError(group.state))
          break
        case 'Queued':
          hasErrorFiles = false
          break
        case 'Completed':
          hasErrorFiles = this.stats.find(group => FileState.isServerError(group.state))
          break
      }
      return {
        numberOfFiles: this.calculateNumberOfFilesInTab(tab),
        hasErrorFiles
      }
    },
    // Get number of files in a title of each tab
    getStatsOfTab (tab) {
      switch (tab) {
        case 'Prepared':
          return this.stats.filter(group => FileState.isInPreparedGroup(group.state))
        case 'Queued':
          return this.stats.filter(group => FileState.isInQueuedGroup(group.state))
        case 'Completed':
          return this.stats.filter(group => FileState.isInCompletedGroup(group.state))
      }
    },
    calculateNumberOfFilesInTab (tab) {
      let groupFileCount = this.getStatsOfTab(tab)
      return groupFileCount.map(s => s.stateCount).reduce((a, b) => a + b, 0)
    },
    checkIfHasErrorFiles (files) {
      return files.filter((file) => FileState.isError(file.state)).length > 0
    },
    async reloadFiles (query, offset, merged = false) {
      let queryOpts = { where: query, order: [['state', 'ASC']] }
      if (typeof offset === 'number') { queryOpts = {...queryOpts, offset, limit: this.$getConst('DEFAULT_LIMIT')} }
      const newFiles = await ipcRendererSend('db.files.query', `db.files.query.${Date.now()}`, queryOpts)
      if (merged) {
        const currentFiles = this.files
        this.files = mergeById(currentFiles, newFiles).sort(fileComparator)
      } else {
        this.files = newFiles.sort(fileComparator)
      }
    },
    async reloadStats () {
      this.stats = await ipcRendererSend('db.files.filesInStreamCount', `db.files.filesInStreamCount.${Date.now()}`, this.selectedStreamId)
      this.retryableFileCount = await ipcRendererSend('db.files.getNumberOfRetryableFiles', `db.files.getNumberOfRetryableFiles.${Date.now()}`, this.selectedStreamId)
      this.queuedFileCount = await ipcRendererSend('db.files.getNumberOfWaitingFiles', `db.files.getNumberOfWaitingFiles.${Date.now()}`, this.selectedStreamId)
    },
    async initFilesFetcher () {
      // fetch at first load
      this.isFetching = true
      await this.reloadStats()
      await this.reloadFiles(this.getQueryBySelectedTab(this.selectedTab), 0)
      this.isFetching = false
      this.startFilesFetcher()
    },
    startFilesFetcher () {
      this.clearFilesFetcher() // make sure it's null before setting a new one
      if (!this.selectedStreamId) return
      const refreshInterval = this.isUploading ? 2000 : 5000
      this.fetchFilesInterval = setInterval(async () => {
        await this.getCurrentStream()
        await this.reloadStats()
        await this.reloadFiles(this.getQueryBySelectedTab(this.selectedTab), 0)
      }, refreshInterval)
    },
    clearFilesFetcher () {
      if (this.fetchFilesInterval) {
        clearInterval(this.fetchFilesInterval)
        this.fetchFilesInterval = null
      }
    },
    async resetFiles () {
      this.stats = []
      this.files = []
      this.clearFilesFetcher()
      await this.initFilesFetcher()
    },
    resetStreams () {
      this.$emit('onNeedResetStreamList')
    },
    async getCurrentStream () {
      if (!this.selectedStreamId) {
        this.selectedStream = null
        return
      }

      this.selectedStream = await ipcRendererSend('db.streams.get', `db.streams.get.${Date.now()}`, this.selectedStreamId)
    },
    async updateStream () {
      try {
        this.isFetchingStreamInfo = true
        const updatedStream = await streamService.fetchStream(this.selectedStream.id)
        this.isFetchingStreamInfo = false
        this.selectedStream = await streamService.updateStream(updatedStream)
      } catch (e) {
        this.isFetchingStreamInfo = false
        console.error('updateStreamIfNeeded: fetch stream error', e)
      }
    }
  },
  watch: {
    selectedStreamId: {
      handler: async function (newStream, previousStream) {
        if (previousStream === newStream) return
        await this.getCurrentStream()
        this.syncSelectedTab()
        await this.resetFiles()
      }
    },
    selectedTab: {
      handler: async function (newTabName, previousTabName) {
        if (previousTabName === newTabName) return
        await this.resetFiles()
      }
    },
    persistedSelectedTab: {
      handler: function (newTabName, previousTabName) {
        if (!newTabName || previousTabName === newTabName || this.currentTab === newTabName) return
        this.currentTab = newTabName
      }
    },
    isUploading: {
      handler: async function (newValue, previousValue) {
        if (previousValue === newValue) return
        this.startFilesFetcher()
      }
    }
  },
  async created () {
    try {
      this.$electron.ipcRenderer.on('db.files.changed', this.onFilesChanged)
      await this.getCurrentStream()
      this.syncSelectedTab()
      this.initFilesFetcher()
    } catch (error) {
      console.error('[FileContainer] initialization failed', error)
    }
  },
  beforeDestroy () {
    this.$electron.ipcRenderer.removeListener('db.files.changed', this.onFilesChanged)
    this.clearFilesFetcher()
  }
}
</script>

<style lang="scss" scoped>
  .wrapper {
    padding-top: $default-padding-margin;
    background: $backgroud-color-dark;
  }
</style>
