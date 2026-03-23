<template>
  <div class="wrapper" v-if="selectedStream">
    <div class="config-wrapper">
      <options-dropdown 
        title="Filename Format" 
        :options="fileNameFormatOptions"
        specialOptionTitle="Custom..."
        :isLoading="isUpdatingFilenameFormat"
        :selectedOptionText="(isCustomTimestampFormat ? 'custom ・ ' : '') + selectedStream.timestampFormat"
        @onSelectOption="onFormatSave"
        @onSelectSpecialOption="openFileNameFormatSettingModal">
      </options-dropdown>
      <options-dropdown 
        title="Timezone source"
        :options="fileNameTimezoneOptions"
        :isLoading="isUpdatingFilenameFormat"
        :selectedOptionText="selectedTimezone"
        @onSelectOption="onTimezoneSave"
        :recorderType="recorderType"
        :isFocus="shouldFocusTimezoneInput">
      </options-dropdown>
    </div>
    <div>
      <button type="button" class="button is-rounded is-cancel mr-2" @click.prevent="confirmToClearAllFiles()" :class="{ 'is-loading': isDeletingAllFiles }">Clear all</button>
      <button type="button" class="button is-rounded is-primary" @click.prevent="onClickStartUpload()" :disabled="numberOfReadyToUploadFiles < 1 || isDeletingAllFiles">Start upload ({{numberOfReadyToUploadFiles}})</button>
    </div>
    <div class="modal is-active" v-if="showSettingModal">
      <div class="modal-background"></div>
      <file-name-format-settings
        :format="selectedStream.timestampFormat"
        @onClose="closeFileNameFormatSettingModal"
        @save="onFormatSave"/>
      <button class="modal-close is-large" aria-label="close"></button>
    </div>
    <ConfirmAlert
    v-if="shouldShowConfirmTimezoneAlert"
    :title="confirmTimezoneAlertText.title"
    :contentHTML="confirmTimezoneAlertText.message"  
    :confirmButtonText="confirmTimezoneAlertText.confirmTitle"
    :cancelButtonText="confirmTimezoneAlertText.cancelTitle"
    @onCancelPressed="recheckTimezoneSettings()"
    @onConfirmPressed="queueToUpload()" />
    <ErrorAlert v-if="errorMessage" :content="errorMessage" @onCancelPressed="errorMessage = null"/>
  </div>
</template>

<script>

import { mapState } from 'vuex'
import FileNameFormatSettings from '../FileNameFormatSettings/FileNameFormatSettings.vue'
import fileFormat from '../../../../../utils/FileFormat'
import fileState from '../../../../../utils/fileState'
import FileTimeZoneHelper from '../../../../../utils/FileTimezoneHelper'
import OptionsDropdown from '../../Common/OptionsDropdown'
import ConfirmAlert from '../../Common/ConfirmAlert'
import ErrorAlert from '../../Common/ErrorAlert'
import ipcRendererSend from '../../../services/ipc'
import dateHelper from '../../../../../utils/dateHelper'
import fileHelper from '../../../../../utils/fileHelper'

const { PREPARING, WAITING } = fileState.state

export default {
  props: {
    numberOfReadyToUploadFiles: {
      type: Number,
      default: () => 0
    },
    selectedStream: Object
  },
  components: { FileNameFormatSettings, ConfirmAlert, ErrorAlert, OptionsDropdown },
  data () {
    return {
      showSettingModal: false,
      isDeletingAllFiles: false,
      isQueuingToUpload: false,
      isUpdatingFilenameFormat: false,
      errorMessage: null,
      selectedTimezone: '',
      deviceTimezoneOffset: null,
      didClickStart: false,
      shouldFocusTimezoneInput: false,
      recorderType: null
    }
  },
  computed: {
    ...mapState({
      selectedStreamId: state => state.AppSetting.selectedStreamId
    }),
    fileNameFormatOptions () {
      return Object.values(fileFormat.fileFormat)
    },
    isCustomTimestampFormat () {
      return !this.fileNameFormatOptions.includes(this.selectedStream.timestampFormat)
    },
    fileNameTimezoneOptions () {
      return FileTimeZoneHelper.getTimezoneOptions(this.selectedStream.timezone).map(item => item === 'Ignore file, use site timezone' ? item + ` (${dateHelper.formattedTzOffsetFromTimezoneName(this.selectedStream.timezone)})` : item)
    },
    timezonePreference () {
      const savedSelectedTimezone = this.$store.getters.getSelectedTimezoneByStreamId(this.selectedStreamId)
      const offset = this.$store.getters.getDeviceTimezoneOffsetConfigByStreamId(this.selectedStreamId)
      return { setting: savedSelectedTimezone, audiomothConfig: offset }
    },
    shouldShowConfirmTimezoneAlert () {
      const mismatchedOption = this.timezonePreference.setting !== this.selectedTimezone
      const audioMothConfiguredTimezone = this.timezonePreference.audiomothConfig
      const mismatchedOffset = audioMothConfiguredTimezone !== this.getSelectedTimezoneValue(this.selectedTimezone)
      return Number.isInteger(audioMothConfiguredTimezone) && mismatchedOption && mismatchedOffset && this.didClickStart
    },
    confirmTimezoneAlertText () {
      const timezone = `${this.selectedTimezone} (${dateHelper.formattedTzOffsetFromTzMinutes(this.getSelectedTimezoneValue(this.selectedTimezone))})`
      const audiomoth = Number.isInteger(this.timezonePreference.audiomothConfig) ? `${FileTimeZoneHelper.fileTimezone.USE_DEVICE_CONFIG} (${dateHelper.formattedTzOffsetFromTzMinutes(this.timezonePreference.audiomothConfig)})` : ''
      return {
        title: `Upload audio in ${this.selectedTimezone}?`,
        message: `The timezone source you chose <b>${timezone}</b> is different from <b>${audiomoth}</b>`,
        confirmTitle: `Upload anyway`,
        cancelTitle: `Recheck`
      }
    }
  },
  async created () {
    this.selectedTimezone = this.timezonePreference.setting
    this.deviceTimezoneOffset = await this.getDefaultDeviceTimezoneOffset()
    this.getFileInfo()
  },
  methods: {
    onClickStartUpload () {
      this.didClickStart = true
      if (!this.shouldShowConfirmTimezoneAlert) {
        this.queueToUpload()
      }
    },
    async queueToUpload () {
      this.shouldFocusTimezoneInput = false
      this.didClickStart = false

      this.isQueuingToUpload = true

      // save selected timezone
      const timezoneObject = {}
      timezoneObject[this.selectedStreamId] = this.selectedTimezone
      this.$store.dispatch('setSelectedTimezone', timezoneObject)

      // set session id
      const sessionId = this.$store.state.AppSetting.currentUploadingSessionId || '_' + Math.random().toString(36).substr(2, 9)
      await this.$store.dispatch('setCurrentUploadingSessionId', sessionId)

      const streamId = this.selectedStreamId
      const query = { streamId, state: PREPARING }
      let timezone = await this.getSelectedTimezoneValue(this.selectedTimezone)
      let bulkUpdateParams = {
        where: query,
        values: { state: WAITING, stateMessage: null, sessionId }
      }
      if (this.selectedTimezone === FileTimeZoneHelper.fileTimezone.USE_FILENAME) {
        let files = await ipcRendererSend('db.files.query', `db.files.query.${Date.now()}`, { where: { streamId: this.selectedStreamId, state: PREPARING } })
        for (let file of files) {
          try {
            timezone = await fileHelper.getFileTimezoneOffsetFromName(file.name)
            await ipcRendererSend('db.files.bulkUpdate', `db.files.bulkUpdate.${Date.now()}`, {
              where: { streamId, state: PREPARING, id: [file.id] },
              values: { state: WAITING, stateMessage: null, sessionId, timezone }
            })
          } catch (e) {
            console.error('[queueToUpload] getFileTimezoneFromName failed', e)
          }
        }
      } else {
        bulkUpdateParams.values.timezone = timezone
        await ipcRendererSend('db.files.bulkUpdate', `db.files.bulkUpdate.${Date.now()}`, bulkUpdateParams)
      }
      console.info('[queueToUpload] selected timezone', timezone)
      this.isQueuingToUpload = false

      // set selected tab to be queue tab
      const tabObject = {}
      tabObject[this.selectedStreamId] = 'Queued'
      await this.$store.dispatch('setSelectedTab', tabObject)

      this.$emit('onNeedResetFileList')
      this.$emit('onNeedResetStreamList')

      // always enable uploading process
      await this.$store.dispatch('enableUploadingProcess', true)
    },
    async getDefaultDeviceTimezoneOffset () {
      return new Promise(async (resolve, reject) => {
        const savedAudioMothTimezone = this.$store.getters.getDeviceTimezoneOffsetConfigByStreamId(this.selectedStreamId)
        if (Number.isInteger(savedAudioMothTimezone)) return resolve(savedAudioMothTimezone)
        return resolve(this.getFileInfo().timezoneOffset)
      })
    },
    async getFileInfo () {
      const files = await ipcRendererSend('db.files.query', `db.files.query.${Date.now()}`, {
        where: {
          streamId: this.selectedStreamId,
          state: fileState.preparedGroup,
          deviceId: { $ne: '' }
        },
        limit: 1
      })
      if (files.length <= 0) return null
      const fileInfo = await this.$file.getDeviceInfo(files[0])
      this.recorderType = fileInfo.recorderType

      return fileInfo
    },
    confirmToClearAllFiles () {
      this.clearAllFiles()
    },
    async clearAllFiles () {
      this.isDeletingAllFiles = true
      await ipcRendererSend('db.files.delete', `db.files.delete.${Date.now()}`, {
        where: {
          streamId: this.selectedStreamId,
          state: fileState.preparedGroup
        }
      })
      this.$emit('onNeedResetFileList')
      this.$emit('onNeedResetStreamList')
      this.isDeletingAllFiles = false
    },
    openFileNameFormatSettingModal () {
      this.showSettingModal = true
    },
    closeFileNameFormatSettingModal () {
      this.showSettingModal = false
    },
    async onFormatSave (format = '') {
      this.closeFileNameFormatSettingModal()
      console.info('[FileNameFormat] onFormatSave', format)
      this.isUpdatingFilenameFormat = true
      this.$file.updateFilesFormat(this.selectedStream, format).then(_ => {
        this.selectedStream.timestampFormat = format
        this.$emit('onNeedResetFileList')
        this.isUpdatingFilenameFormat = false
      }).catch(error => {
        this.isUpdatingFilenameFormat = false
        console.log(`Error update files format '${format}'`, error.message)
        this.errorMessage = error.message
      })
    },
    async onTimezoneSave (timezone) {
      if (timezone === FileTimeZoneHelper.fileTimezone.USE_DEVICE_CONFIG && this.deviceTimezoneOffset === null) {
        this.errorMessage = 'No timezone in metadata found'
      } else {
        this.selectedTimezone = timezone
      }
    },
    getSelectedTimezoneValue (selectedTimezone) {
      switch (selectedTimezone) {
        case FileTimeZoneHelper.fileTimezone.UTC: return 0
        case FileTimeZoneHelper.fileTimezone.LOCAL_TIME: return dateHelper.tzOffsetMinutesFromTzName(this.selectedStream.timezone)
        case FileTimeZoneHelper.fileTimezone.USE_DEVICE_CONFIG: return this.deviceTimezoneOffset
        default: return 0
      }
    },
    recheckTimezoneSettings () {
      this.didClickStart = false
      this.shouldFocusTimezoneInput = true
    }
  },
  watch: {
    async selectedStream () {
      // if updated selected stream, then reset selected timezone
      this.selectedTimezone = this.timezonePreference.setting
      this.deviceTimezoneOffset = await this.getDefaultDeviceTimezoneOffset()
      this.getFileInfo()
    }
  }
}
</script>

<style lang="scss" scoped>
  .wrapper {
    padding: $default-padding;
    display: flex;
    justify-content: space-between;
    align-self: center;
    white-space: nowrap;
    text-overflow: ellipsis;
    &__title {
      font-weight: $title-font-weight;
      color: $secondary-text-color;
      display: block;
    }
    &__description {
      color: $secondary-text-color;
      display: inline-block;
    }
  }
  .config-wrapper {
    display: inline-flex;
    .dropdown-wrapper {
      padding-right: $default-padding;
    }
  }
  .flex-row {
    flex-direction: row;
  }
  .align-center {
    align-items: center;
  }
  .mr-2 {
    margin-right: 2px;
  }
</style>
