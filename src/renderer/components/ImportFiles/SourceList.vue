<template>
  <table>
    <tr class="source-type__row">
      <span class="source-type__title">Arbimon Companion SD Card</span>
    </tr>
    <template v-if="!companionDrives || companionDrives.length === 0">
      <tr>
        <img class="row__icon" src="@/assets/ic-sd-card-gray.svg"/>
        <span class="row__source-title">No Arbimon Companion SD Card detected</span>
      </tr>
    </template>
    <template v-else>
    <tr v-for="drive in companionDrives" :key="drive.id" @click="onDriveSelected(drive)" :class="{'selected': isSelectedDrive(drive)}">
      <img class="row__icon" src="@/assets/ic-sd-card-white.svg" v-if="isSelectedDrive(drive) || defaultState"/>
      <img class="row__icon" src="@/assets/ic-sd-card-gray.svg" v-else/>
      <span class="row__source-title" :class="{'default': defaultState}">{{ drive.label }}</span>
      <RecorderTag :show="drive.deviceId" :isSelected="(isSelectedDrive(drive) || defaultState)" :type="drive.recorderType"/>
    </tr>
    </template>
    <template>
    <tr class="source-type__row">
      <span class="source-type__title">Other sources</span>
    </tr>
    <tr @click="onClickChangeFolder" :class="{'selected':  isSelected('folder') }">
      <input type="file" ref="folder" webkitdirectory directory @change="handleFolderChange" style="display:none"/>
      <img class="row__icon" src="@/assets/ic-folder-empty-white.svg" v-if="isSelected('folder') || defaultState"/>
      <img class="row__icon" src="@/assets/ic-folder-empty.svg" v-else/>
      <span class="row__source-title" :class="{'default': defaultState}" v-if="selectedFolder.path">{{ selectedFolder.path }}</span>
      <span class="row__folder-button" :class="{'default': defaultState}" v-else>Choose a folder</span>
      <RecorderTag :show="selectedFolder.deviceId" :isSelected="(isSelected('folder') || defaultState)" :type="selectedFolder.recorderType"/>
    </tr>
    <tr @click="onClickChooseFiles" :class="{'selected':  isSelected('file') }">
      <input type="file" ref="file" multiple @change="handleFilesChange" style="display:none"/>
      <img class="row__icon" src="@/assets/ic-file-white.svg" v-if="isSelected('file') || defaultState"/>
      <img class="row__icon" src="@/assets/ic-file.svg" v-else/>
      <span class="row__source-title" :class="{'default': defaultState}" v-if="numberOfSelectedFiles > 0">{{ numberOfSelectedFiles + ' files selected' }}</span>
      <span class="row__folder-button" :class="{'default': defaultState}" v-else>Choose files</span>
      <RecorderTag :show="isSelected('file') && selectedSource.deviceId" :isSelected="(isSelected('file') || defaultState)" :type="selectedSource.recorderType"/>
    </tr>
    </template>
  </table>
</template>

<script>
import path from 'path'
import DriveList from '../../../../utils/DriveListHelper'
import fileHelper from '../../../../utils/fileHelper'
import FileSource from './FileSorce'
import RecorderTag from '../Common/Tag/RecorderTag'

function getDeviceId (deviceInfo) {
  return deviceInfo ? deviceInfo.deviceId : null
}

function getDeploymentId (deviceInfo) {
  return deviceInfo ? deviceInfo.deploymentId : null
}

function getDeviceRecorderType (deviceInfo) {
  return deviceInfo ? deviceInfo.recorderType : null
}

export default {
  data: () => ({
    driveFetchingInterval: null,
    drives: null,
    selectedSource: {},
    selectedFolder: {},
    selectedFiles: [],
    defaultState: true,
    isLoading: false // user hasn't selected any options before
  }),
  components: { RecorderTag },
  computed: {
    numberOfSelectedFiles () {
      return this.selectedFiles.length
    },
    companionDrives () {
      if (this.drives === null || this.drives.length === 0) return []
      return this.drives.filter(drive => drive.deploymentId)
    }
  },
  methods: {
    getSelectedFolderPath (files) {
      if (!files || files.length === 0) return null
      const firstFile = files[0]
      if (!firstFile || !firstFile.path) return null
      const relativePath = firstFile.webkitRelativePath || ''
      if (!relativePath) {
        return fileHelper.isFolder(firstFile.path) ? firstFile.path : fileHelper.getDirectoryFromFilePath(firstFile.path)
      }
      const relativeParts = relativePath.split('/').filter(Boolean)
      const rootFolderName = relativeParts[0]
      if (!rootFolderName) {
        return fileHelper.getDirectoryFromFilePath(firstFile.path)
      }
      const absoluteParts = firstFile.path.split(/[\\/]/)
      const rootFolderIndex = absoluteParts.lastIndexOf(rootFolderName)
      if (rootFolderIndex === -1) {
        return fileHelper.getDirectoryFromFilePath(firstFile.path)
      }
      return absoluteParts.slice(0, rootFolderIndex + 1).join(path.sep)
    },
    async getExternalDriveList () {
      this.isLoading = true
      const drives = await DriveList.getExternalDriveList()
      this.isLoading = false
      if (drives.length === 0) return
      this.drives = await Promise.all(drives.map(async drive => {
        const deviceInfo = await this.$file.getDeviceInfoFromFolder(drive.path)
        const deviceId = deviceInfo ? deviceInfo.deviceId : null
        const deploymentId = deviceInfo ? deviceInfo.deploymentId : null
        const recorderType = deviceInfo ? deviceInfo.recorderType : null
        return {...drive, deviceId, deploymentId, recorderType}
      }))
    },
    onDriveSelected (drive) {
      this.selectedSource = new FileSource.FileSourceFromExternal(drive.id, drive.deviceId, drive.deploymentId, drive.recorderType, drive.path, drive.label)
    },
    onClickChangeFolder () {
      this.$refs.folder.click()
    },
    async handleFolderChange (event) {
      const path = this.getSelectedFolderPath(event.target.files)
      if (!path) return
      const deviceInfo = await this.$file.getDeviceInfoFromFolder(path)
      const deviceId = getDeviceId(deviceInfo)
      const deploymentId = getDeploymentId(deviceInfo)
      const recorderType = getDeviceRecorderType(deviceInfo)
      this.selectedFolder = {path, deviceId, deploymentId, recorderType}
      this.selectedSource = new FileSource.FileSourceFromFolder(path, deviceId, deploymentId, recorderType)
      // reset selected files
      this.selectedFiles = []
    },
    async onClickChooseFiles () {
      this.$refs.file.click()
    },
    async handleFilesChange (event) {
      if (!event.target.files) { return }
      const files = [...event.target.files].map(file => {
        return {
          'lastModified': file.lastModified,
          'lastModifiedDate': file.lastModifiedDate,
          'name': file.name,
          'size': file.size,
          'type': file.type,
          'path': file.path
        }
      })
      this.selectedFiles = files
      const firstWavFile = files.find(file => fileHelper.getExtension(file.path) === 'wav') // read only wav file header info
      const deviceInfo = await this.$file.getDeviceInfo(firstWavFile)
      const deviceId = getDeviceId(deviceInfo)
      const deploymentId = getDeploymentId(deviceInfo)
      const recorderType = getDeviceRecorderType(deviceInfo)
      this.selectedSource = new FileSource.FileSourceFromFiles('id', deviceId, deploymentId, recorderType, files)
      // reset selected folder
      this.selectedFolder = {}
    },
    isSelected (type) {
      switch (type) {
        case 'external': return this.selectedSource instanceof FileSource.FileSourceFromExternal
        case 'file': return this.selectedSource instanceof FileSource.FileSourceFromFiles
        case 'folder': return this.selectedSource instanceof FileSource.FileSourceFromFolder
        default: return false
      }
    },
    isSelectedDrive (drive) {
      return this.isSelected('external') && this.selectedSource.id === drive.id
    }
  },
  watch: {
    selectedSource (val, oldVal) {
      if (val === oldVal) return
      if (this.defaultState === true) { // first time
        this.defaultState = false
      }
      this.$emit('sourceSelected', val)
    }
  },
  async created () {
    // fetch drive list for the first time
    await this.getExternalDriveList()

    // set an interval to fetch drive list every 5 secs
    this.driveFetchingInterval = setInterval(async () => {
      await this.getExternalDriveList()
    }, 5000)
  },
  beforeDestroy () {
    clearInterval(this.driveFetchingInterval)
  }
}
</script>

<style lang="scss" scoped>
  .row {
    &__icon {
      width: 40px;
      height: 40px;
      vertical-align: middle;
      padding: $default-padding-margin;
    }
  }
  table {
    margin: $default-padding-margin 0px;
    width: 300px;
  }
  tr {
    margin-bottom: $default-padding-margin;
    height: 40px;
    span {
      color: $secondary-text-color;
    }
    &.selected span,
    span.default {
      color: $body-text-color;
    }
    &:hover {
      cursor: pointer;
    }
  }
  .source-type {
      &__row {
        height: 20px;
        margin-bottom: 0;
        display: flex;
        justify-content: space-between;
        align-self: center;
        white-space: nowrap;
      }
      &__title {
        font-size: 12px;
        color: $secondary-text-color;
        font-weight: 700;
      }
    }
</style>
