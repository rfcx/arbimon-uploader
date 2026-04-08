<template>
  <div>
    <loader :show="isFetching" v-if="isFetching"></loader>
    <table class="table file-list-table is-hoverable" v-else-if="files.length > 0">
      <thead>
        <tr>
          <td v-if="!isPreparedTab" class="file-list-table__cell file-list-table__cell_status"></td>
          <td class="file-list-table__cell file-list-table__cell_name">Name</td>
          <td class="file-list-table__cell file-list-table__cell_timestamp">Timestamp</td>
          <td class="file-list-table__cell file-list-table__cell_info">Duration</td>
          <td class="file-list-table__cell file-list-table__cell_info">File size</td>
          <td class="file-list-table__cell file-list-table__cell_controls"></td>
        </tr>
      </thead>
      <tbody>
        <file-row :selectedTab="selectedTab" v-for="file in files" :key="file.id" :initialFile="file" @onTrashPressed="showConfirmToDeleteFileDialog(file)"></file-row>
      </tbody>
      <tfoot v-if="!isPreparedTab" class="footer-text">
        <tr v-if="isUploading">
          <td colspan="6" class="footer-text__title is-size-7" v-if="isQueuedTab">{{statsDetail}}</td>
          <td colspan="6" class="footer-text__info is-size-7" v-else>Only the latest {{this.$getConst('DEFAULT_LIMIT')}} files are shown while uploading. Pause or wait for the upload to complete to see all files.</td>
        </tr>
        <tr v-else-if="isLoadingMore">
          <td colspan="6" class="footer-text__title is-size-6">
            <fa-icon :icon="icons.loading" aria-hidden="true" spin></fa-icon>
          </td>
        </tr>
      </tfoot>
    </table>
    <empty-view v-else-if="files.length === 0" :hasFileInQueued="hasFileInQueued" :isDragging="isDragging" @onImportFiles="onImportFiles" @onSelectFolder="$emit('onSelectFolder')"></empty-view>
    <confirm-alert
      :content="deleteAlertTitle"
      confirmButtonText="Delete"
      :isProcessing="isDeleting"
      v-if="shouldShowConfirmToDeleteAlert"
      @onCancelPressed="hideConfirmToDeleteDialog"
      @onConfirmPressed="deleteFile"/>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import ConfirmAlert from '../../Common/ConfirmAlert'
import Loader from '../../Common/Loader'
import EmptyView from '../EmptyView'
import FileRow from './FileRow'
import FileState from '../../../../../utils/fileState'
import ipcRendererSend from '../../../services/ipc'

export default {
  props: {
    files: Array,
    stats: Array,
    hasFileInQueued: Boolean,
    selectedTab: String,
    isDragging: Boolean,
    isFetching: Boolean,
    isLoadingMore: Boolean
  },
  data: () => ({
    isDeleting: false,
    deleteAlertTitle: 'Are you sure you want to remove this file?',
    shouldShowConfirmToDeleteAlert: false,
    fileToBeDeleted: null
  }),
  components: {
    EmptyView, FileRow, ConfirmAlert, Loader
  },
  computed: {
    ...mapState({
      selectedStreamId: state => state.AppSetting.selectedStreamId,
      currentUploadingSessionId: state => state.AppSetting.currentUploadingSessionId,
      isUploadingProcessEnabled: state => state.AppSetting.isUploadingProcessEnabled
    }),
    icons: () => ({
      loading: faCircleNotch
    }),
    isPreparedTab () {
      return this.selectedTab === 'Prepared'
    },
    isQueuedTab () {
      return this.selectedTab === 'Queued'
    },
    statsDetail () {
      const sum = this.stats.map(s => s.stateCount).reduce((a, b) => a + b, 0)
      const moreFiles = sum - this.files.length
      if (moreFiles <= 0) return ''
      if (this.isQueuedTab) {
        return `and ${moreFiles} more files in the queue`
      } else {
        return ''
      }
    },
    isUploading () {
      return this.currentUploadingSessionId && this.isUploadingProcessEnabled
    }
  },
  methods: {
    showConfirmToDeleteFileDialog (file) {
      this.deleteAlertTitle = `Are you sure you want to remove ${file.name}?`
      this.shouldShowConfirmToDeleteAlert = true
      this.fileToBeDeleted = file
    },
    hideConfirmToDeleteDialog () {
      this.shouldShowConfirmToDeleteAlert = false
      this.fileToBeDeleted = null
    },
    async deleteFile () {
      // if (!(this.fileToBeDeleted && this.fileToBeDeleted.canRemove)) return
      if (!(this.fileToBeDeleted && FileState.canRemove(this.fileToBeDeleted.state))) return
      this.isDeleting = true
      // await Stream.dispatch('filesRemovedFromPreparing', { streamId: this.fileToBeDeleted.streamId, amount: 1 })
      // await File.delete(this.fileToBeDeleted.id)
      await ipcRendererSend('db.files.delete', `db.files.delete.${Date.now()}`, { where: { id: this.fileToBeDeleted.id } })
      this.isDeleting = false
      this.$emit('onNeedResetFileList')
      this.hideConfirmToDeleteDialog()
    },
    onImportFiles (files) {
      this.$emit('onImportFiles', files)
    }
  }
}
</script>

<style lang="scss" scoped>
  thead {
    text-transform: uppercase;
  }
  thead td,
  thead th {
    color: $secondary-text-color !important;
    padding: 0.5em $default-padding !important;
  }
  .table tbody {
    overflow-y: auto;
  }
  .file-list-table {
    &__cell {
      &_name,
      &_error {
        width: 35%;
        width: 28%;
      }
      &_timestamp {
        width: 22%;
      }
      &_info {
        width: 15%;
        width: 16%;
      }
      &_controls {
        width: 10%;
        text-align: right;
        padding-right: 24px;
      }
    }
  }
  .footer-text {
    td {
      text-align: center !important;
    }
    &__title {
      color: $body-text-color !important;
    }
    &__info {
      color: $secondary-text-color !important;
    }
  }

  .notification {
    margin: auto $default-padding-margin;
  }
</style>
