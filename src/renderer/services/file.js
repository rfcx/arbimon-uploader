import electron from 'electron'
import settings from './settings'
import api from '../../../utils/api'
import fileHelper from '../../../utils/fileHelper'
import dateHelper from '../../../utils/dateHelper'
import FileFormat from '../../../utils/FileFormat'
import cryptoJS from 'crypto-js'
import store from '../store'
import FileInfo from './FileInfo'
import fs from 'fs'
import path from 'path'
import { createAnalytics } from './analytics'
import env from '../../../env.json'
import fileState from '../../../utils/fileState'
import ipcRendererSend from './ipc'
import SongMeterFileInfo from './SongMeterFileInfo'

const { PREPARING, ERROR_LOCAL, ERROR_SERVER, WAITING, PROCESSING, CONVERTING, COMPLETED } = fileState.state

const FORMAT_AUTO_DETECT = FileFormat.fileFormat.AUTO_DETECT
const analytics = createAnalytics(env.analytics.id)
const PROJECT_DURATION_LIMIT_EXCEEDED_MESSAGE = 'Project recording-minute limit exceeded. This file cannot be uploaded because the project has reached its recording limit.'

const extractSongMeterFileInfo = async (file) => {
  if (file.extension !== 'wav') return new SongMeterFileInfo('')
  try {
    const metadata = await fileHelper.readGuanMetadata(file.path)
    return new SongMeterFileInfo(metadata || '')
  } catch (e) {
    console.error('Read file info error', e)
    return new SongMeterFileInfo('')
  }
}

class FileProvider {
  /**
  * Import files
  * @param {FileList} droppedFiles
  * @param {Stream} selectedStream
  */
  async handleDroppedFiles (droppedFiles, selectedStream, deploymentInfo = null) {
    if (droppedFiles.length === 0) {
      return
    }

    // Convert dropped files (from drag&drop) to database file objects
    const t0 = performance.now()
    let fileObjects = []
    let fileObjectsInFolder = []
    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles[i]
      const fileObject = this.createFileObject(file.path, selectedStream, deploymentInfo)
      if (fileObject) {
        fileObjects.push(fileObject)
      }
    }
    const allFileObjects = fileObjects.concat(fileObjectsInFolder)
    const t1 = performance.now()
    console.info('[FileService] ⏱ forming file objects ' + (t1 - t0) + ' ms')

    // Remove duplicates that are already in prepare tab
    // const existingPreparedFilePaths = File.query().where((file) => file.streamId === selectedStream.id).get().reduce((result, value) => {
    //   result[value.path] = value.state
    //   return result
    // }, {})
    const existingPreparedFilePaths = await this.getExistingPreparedFilePaths(selectedStream.id)
    const allFileObjectsFiltered = allFileObjects.filter(file => existingPreparedFilePaths[file.path] === undefined || !fileState.isInPreparedGroup(existingPreparedFilePaths[file.path]))
    // Set error message for duplicates that are either uploading or completed
    allFileObjectsFiltered.forEach(file => {
      const hasUploadedBefore = existingPreparedFilePaths[file.path] !== undefined && !fileState.isInPreparedGroup(existingPreparedFilePaths[file.path])
      if (hasUploadedBefore) {
        file.state = ERROR_LOCAL
        file.stateMessage = 'Duplicate (uploading or complete)'
      }
    })
    const t2 = performance.now()
    console.info('[FileService] ⏱ perform duplicate checks ' + (t2 - t1) + ' ms')

    // Insert converted files into db
    await this.insertNewFiles(allFileObjectsFiltered, selectedStream)
    // electron.ipcRenderer.send('getFileDurationRequest', allFileObjectsFiltered)
    electron.ipcRenderer.send('client.message', {
      client: 'api',
      topic: 'services.file.new'
    })
  }

  async handleDroppedFolder (folderPath, selectedStream, deploymentInfo = null) {
    if (!folderPath) return
    console.info('[FileService] handleDroppedFolder', folderPath, selectedStream)
    const fileObjectsInFolder = (await this.getFileObjectsFromFolder(folderPath, selectedStream, null, deploymentInfo))
      .filter(file => fileHelper.isSupportedFileExtension(file.extension))
    // insert converted files into db

    // Remove duplicates that are already in prepare tab
    // const existingPreparedFilePaths = File.query().where((file) => file.streamId === selectedStream.id).get().reduce((result, value) => {
    //   result[value.path] = value.state
    //   return result
    // }, {})
    const existingPreparedFilePaths = await this.getExistingPreparedFilePaths(selectedStream.id)
    const allFileObjectsFiltered = fileObjectsInFolder.filter(file => existingPreparedFilePaths[file.path] === undefined || !fileState.isInPreparedGroup(existingPreparedFilePaths[file.path]))
    // Set error message for duplicates that are either uploading or completed
    allFileObjectsFiltered.forEach(file => {
      const hasUploadedBefore = existingPreparedFilePaths[file.path] !== undefined && !fileState.isInPreparedGroup(existingPreparedFilePaths[file.path])
      if (hasUploadedBefore) {
        file.state = ERROR_LOCAL
        file.stateMessage = 'Duplicate (uploading or complete)'
      }
    })

    await this.insertNewFiles(allFileObjectsFiltered, selectedStream)
    // electron.ipcRenderer.send('getFileDurationRequest', fileObjectsInFolder)
    // electron.ipcRenderer.send('services.file.added')
    electron.ipcRenderer.send('client.message', {
      client: 'api',
      topic: 'services.file.new'
    })
  }

  getExistingPreparedFilePaths (streamId) {
    return ipcRendererSend('db.files.query', `db.files.query.${Date.now()}`, { where: { streamId } })
      .then((files) => {
        return files.reduce((result, value) => {
          result[value.path] = value.state
          return result
        }, {})
      })
  }

  async getFileObjectsFromFolder (folderPath, selectedStream, existingFileObjects = null, deploymentInfo = null) {
    // get the files in the directory
    const files = await this.searchFilesFromFolder(folderPath)
    // write file into file object array
    let fileObjects = existingFileObjects || []
    files.forEach(file => {
      const fileObject = this.createFileObject(file.path, selectedStream, deploymentInfo)
      if (fileObject) {
        fileObjects.push(fileObject)
      }
    })
    return fileObjects
  }
  async updateFilesDuration (files) {
    for (const file of files) {
      try {
        const durationInSecond = await fileHelper.getFileDuration(file.path)
        await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
          id: file.id,
          params: { durationInSecond }
        })
      } catch (error) {
        const nodurationErrorMessage = 'No duration found'
        console.error('Failed updating file duration', error)
        const hasNoDuration = error.message.includes(nodurationErrorMessage)
        let errorState = ERROR_SERVER
        if (fileState.isInPreparedGroup(file.state) && hasNoDuration) {
          errorState = ERROR_LOCAL
        }
        await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
          id: file.id,
          params: { durationInSecond: -2, state: errorState, stateMessage: error.message || nodurationErrorMessage }
        })
      }
    }
  }

  async putFilesIntoUploadingQueue (files) {
    console.info('[FileService] putFilesIntoUploadingQueue', files)
    // if there is an active session id then reuse that, otherwise generate a new one
    const sessionId = store.state.AppSetting.currentUploadingSessionId || '_' + Math.random().toString(36).substr(2, 9)
    store.dispatch('setCurrentUploadingSessionId', sessionId)
    for (const file of files) {
      await ipcRendererSend('db.files.update', `db.files.update.${file.id}.${Date.now()}`, {
        id: file.id,
        params: { state: WAITING, stateMessage: null, sessionId: sessionId }
      })
    }
    // always enable uploading process
    await store.dispatch('enableUploadingProcess', true)
  }

  async removeQueuedFiles (streamId, state) {
    console.info('[FileService] removeQueuedFiles', state)
    // if there is an active session id then reuse that, otherwise generate a new one
    const sessionId = store.state.AppSetting.currentUploadingSessionId || '_' + Math.random().toString(36).substr(2, 9)
    store.dispatch('setCurrentUploadingSessionId', sessionId)
    await ipcRendererSend('db.files.bulkUpdate', `db.files.bulkUpdate.${Date.now()}`, {
      where: { streamId, state },
      values: { state: PREPARING, sessionId }
    })
  }

  /**
     * Update preparing file format
     * @param {*} format string of format
     * @param {*} fileObjectList list of files
     * @param {*} stream file's stream
     */
  async updateFilesFormat (stream, format = FORMAT_AUTO_DETECT) {
    const t0 = performance.now()
    const fileObjectList = (await ipcRendererSend('db.files.query', `db.files.query.${Date.now()}`, {
      where: { state: fileState.preparedGroup }
    })).filter(file => fileState.canChangeTimestampFormat(file.state, file.stateMessage))
    const updatedFiles = await Promise.all(fileObjectList.map(async file => {
      let timestamp
      if (!timestamp) {
        timestamp = dateHelper.getIsoDateWithFormat(format, file.name)
      }
      const { state, message } = this.getState(timestamp, file.extension)
      const newFile = { ...file }
      // update fields
      newFile.state = state
      newFile.stateMessage = message
      newFile.timestamp = timestamp
      return newFile
    }))
    const t1 = performance.now()
    console.info('[FileService] ⏱ finish forming objects ' + (t1 - t0) + ' ms')
    for (let file of updatedFiles) {
      await ipcRendererSend('db.files.update', `db.files.update.${file.id}.${Date.now()}`, {
        id: file.id,
        params: {
          state: file.state,
          stateMessage: file.stateMessage,
          timestamp: file.timestamp
        }
      })
    }
    const t2 = performance.now()
    console.info('[FileService] ⏱ update timestamp format ' + (t2 - t1) + ' ms')
    // electron.ipcRenderer.send(DatabaseEventName.eventsName.updateFileTimestampRequest, data)
    // electron.ipcRenderer.on(DatabaseEventName.eventsName.updateFileTimestampResponse, listen)

    // await Stream.update({
    //   where: stream.id,
    //   data: { files: updatedFiles, timestampFormat: format },
    //   update: ['timestampFormat', 'files']
    // })
    await ipcRendererSend('db.streams.update', `db.streams.update.${Date.now()}`, {
      id: stream.id,
      params: { timestampFormat: format }
    })

    console.info(`[FileService] Updated ${updatedFiles.length} file(s) to stream '${stream.id}'`)
    console.info(`[FileService] Updated timestampFormat '${format}' to stream '${stream.id}'`)
  }

  /**
     * @param {*} stream file's stream
     * @param {*} file target file to rename
     * @param {*} filename new file name
     */
  async renameFile (file, filename) {
    const streamId = file.streamId
    // const stream = Stream.find(streamId)
    const stream = await ipcRendererSend('db.streams.get', `db.streams.get.${Date.now()}`, streamId)

    if (!stream) {
      throw new Error(`Stream not found`)
    }

    /**
         * File list from stream
        */
    const files = [...(stream.files || [])]

    /**
         * Check already exists file name
        */
    const checkFileAlreadyExists = filePath => {
      // check new file path in stream & file state on preparing
      const fileIdx = files.findIndex(f => (f.path === filePath && ['local_error', 'preparing'].includes(f.state)))
      if (fileIdx > -1 || fs.existsSync(filePath)) {
        throw new Error(`A file with the same name already exists. specify another name.`)
      }
    }

    /**
         * @ function rename file name
         * @ convert callback to promise
        */
    const renameFileOnDisk = () => {
      const path = file.path
      const oldFilename = file.name
      const filenameIdx = path.lastIndexOf(oldFilename)

      let newPath = path
      if (filenameIdx > -1) {
        // concat old path with new file name
        newPath = path.substring(0, filenameIdx) + filename
      }

      if (newPath !== path) {
        // if file already exists then throw error
        checkFileAlreadyExists(newPath)
        return fileHelper.rename(path, newPath, 3)
      } else {
        console.log(`File doesn't need to rename, Because old file name equal to new file name`)
        return Promise.resolve('')
      }
    }

    console.log(`Renaming file name...`)
    // update file name
    const newPath = await renameFileOnDisk()
    if (newPath === '') {
      return Promise.resolve()
    }

    console.log(`Rename file on disk success`)

    console.log(`Checking file name state`)
    // checking file status with new file name

    const format = stream.timestampFormat
    const isoDate = dateHelper.getIsoDateWithFormat(format, filename)
    const stateObj = this.getState(isoDate, file.extension, false)

    // ----- update file on database -----
    const updateFields = {
      state: stateObj.state,
      stateMessage: stateObj.message,
      timestamp: isoDate,
      name: filename,
      path: newPath
    }
    // await File.update({
    //   where: file.id,
    //   data: updateFields,
    //   update: Object.keys(updateFields)
    // })
    await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: updateFields
    })

    console.log(`Update file success`)
    return Promise.resolve(updateFields)
    // const newFile = { ...file, ...updateFields }
    // const fileIdx = files.findIndex(f => f.id === file.id)
    // if (fileIdx > -1) {
    //   files[fileIdx] = newFile
    //   await Stream.update({
    //     where: stream.id,
    //     data: { files },
    //     update: ['files']
    //   })

    //   console.log(`Update stream success`)
    // }
  }

  // 2. Upload files
  // - Upload
  // - check status

  /* -- API Wrapper -- */
  async uploadFile (file, idToken) {
    console.info('[FileService] ⬆ uploading...', file.id)
    if (!fileHelper.isExist(file.path)) {
      console.info('[FileService] ⬆ File does not exist in the folder', file.id)
      return Promise.reject(new Error('File does not exist'))
    }
    if (file.uploadId) {
      console.info('[FileService] ⬆ File has uploadId', file.id, file.uploadId)
      return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
        id: file.id,
        params: { uploaded: true, uploadedTime: Date.now(), state: PROCESSING, stateMessage: '' }
      })
    }
    // Update the status of uploading file straightaway after putting this file in the queue to prevent a duplicate upload -
    // rfcx/arbimon-uploader/issues/217
    await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: { state: CONVERTING, uploaded: false }
    })
    const timestamp = fileHelper.getUtcTimestamp(file)
    const songMeterFileInfo = await extractSongMeterFileInfo(file)
    const metadata = songMeterFileInfo.metadata ? {comment: songMeterFileInfo.formattedMetadata, artist: songMeterFileInfo.model} : null
    const durationInMillisecond = file.durationInSecond * 1000
    return api.uploadFile(this.isProductionEnv(), file.id, file.name, file.path, file.extension, file.streamId, timestamp, durationInMillisecond, file.sizeInByte, idToken, metadata, (progress) => {
      // FIX progress scale when we will start work with google cloud
    }).then((uploadId) => {
      console.info(`[FileService] ⬆ on S3 ${file.name} ${uploadId} ${file.id}`)
      // return File.update({ where: file.id, data: { uploaded: true, uploadedTime: Date.now() } })
      return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
        id: file.id,
        params: { uploaded: true, uploadedTime: Date.now(), state: PROCESSING, stateMessage: '' }
      })
    }).catch(async (error) => {
      console.error('[FileService] ⬆ error', file.name, error.message, error.name)
      if (error.message === 'Duplicate.') { // if duplicate file (same site, same file data, same filename), then show as completed
        return this.markFileAsCompleted(file)
      }

      // should not retry
      const shouldNotAutoRetry = ['Invalid.', 'Request body larger than maxBodyLength limit'].includes(error.message) || ['ForbiddenError', 'ValidationError'].includes(error.name) || error.message.includes('Future date') || error.message.includes('Validation errors')
      if (shouldNotAutoRetry) {
        if (error.message === 'Invalid.') { // (same site, same file data, different filename)
          return this.markFileAsFailed(file, 'Duplicate file. Matching sha1 signature already ingested.')
        }
        if (error.message === 'Request body larger than maxBodyLength limit') {
          return this.markFileAsFailed(file, 'File size exceeded. Maximum file size is 200 MB')
        }
        if (error.message.includes('Future date')) {
          return this.markFileAsFailed(file, 'Filename with future date is not permitted.')
        }
        if (error.message.includes('Project recording-minute limit exceeded')) {
          return this.markFileAsFailed(file, PROJECT_DURATION_LIMIT_EXCEEDED_MESSAGE)
        }
        return this.markFileAsFailed(file, error.message)
      }

      // auto retry to upload
      if (file.retries < 3) {
        return this.markFileAsRetryToUpload(file)
      }
      // error after auto retry
      if (['write EPIPE', 'read ECONNRESET', 'Network Error', 'ETIMEDOUT', '400'].includes(error.message)) {
        return this.markFileAsFailed(file, 'Network Error')
      }
      if (error.message.includes('Failed creating stream source file and segments')) {
        return this.markFileAsFailed(file, 'Site creation failed. Please try again.')
      }
      // default
      return this.markFileAsFailed(file, 'There was a system error. Please try again later.')
    })
  }

  checkStatus (file, idToken, isSuspended) {
    // If the app suspends/loses internet connection the uploading file changes the status to waiting
    if (!file.uploadId) { return this.markFileAsSuspend(file) }
    return api
      .checkStatus(this.isProductionEnv(), file.uploadId, idToken)
      .then(async (data) => {
        const status = data.status
        const failureMessage = data.failureMessage
        console.log(`[FileService] checkStatus ===> ${file.name} ${file.uploadId} - Ingest status = ${status}`)
        // const currentStateOfFile = File.find(file.id).state
        const currentStateOfFile = file.state
        switch (status) {
          case 0:
            // return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
            //   id: file.id,
            //   params: { state: UPLOADING }
            // })
            if (isSuspended) {
              // If the app suspends/loses internet connection the uploading file changes the status to waiting
              return this.markFileAsSuspend(file)
            }
            return
          case 10:
            if (currentStateOfFile === PROCESSING) return
            return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
              id: file.id,
              params: { state: PROCESSING, stateMessage: null, progress: 100 }
            })
          case 20:
            if (currentStateOfFile === COMPLETED) return
            const uploadTime = Date.now() - file.uploadedTime
            const analyticsEventObj = { 'ec': env.analytics.category.time, 'ea': env.analytics.action.ingest, 'el': `${file.name}/${file.uploadId}`, 'ev': uploadTime }
            await analytics.send('event', analyticsEventObj)
            return this.markFileAsCompleted(file)
          case 31:
            if (failureMessage.includes('Cannot create source file with provided data')) {
              return this.markFileAsCompleted(file, 'Duplicate.')
            }
            return this.markFileAsFailed(file, failureMessage)
          case 30:
          case 32:
            if (failureMessage.includes('is zero')) {
              return this.markFileAsFailed(file, 'Corrupted file')
            } else if (failureMessage.includes('duration is more than 1 hour') || failureMessage.includes('exceeding our limit')) {
              return this.markFileAsFailed(file, 'Audio duration is longer than 1 hour. Please split files into shorter durations.')
            } else if (file.retries < 3) {
              return this.markFileAsRetryToUpload(file)
            }
            return this.markFileAsFailed(file, failureMessage)
          default:
            return this.markFileAsFailed(file, failureMessage)
        }
      })
      .catch(async (error) => {
        console.error('[FileService] check status error', error)
        if (file.retries < 3) {
          return this.markFileAsRetryToUpload(file)
        } else {
          return this.markFileAsFailed(file, 'There was a system error. Please try again later.')
        }
      })
  }

  isProductionEnv () {
    return settings.get('settings.production_env')
  }

  /* -- Database wrapper -- */
  async insertNewFiles (files, selectedStream) {
    const t0 = performance.now()
    await this.insertFiles(files)
    const t1 = performance.now()
    console.info('[FileService] ⏱ insertNewFiles ' + (t1 - t0) + ' ms')
  }

  async insertFiles (files) {
    const dedupedFiles = files.filter((file, index, list) => {
      return list.findIndex((candidate) => candidate.id === file.id || candidate.path === file.path) === index
    })

    if (dedupedFiles.length <= 0) {
      return
    }

    await ipcRendererSend('db.files.bulkCreate', `db.files.bulkCreate.${Date.now()}`, dedupedFiles)
  }

  async markFileAsRetryToUpload (file) {
    return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: { state: WAITING, uploadId: null, stateMessage: null, progress: 0, retries: file.retries + 1 }
    })
  }

  async markFileAsSuspend (file) {
    return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: { state: WAITING, uploadId: null, stateMessage: null, progress: 0, retries: 0 }
    })
  }

  async markFileAsCompleted (file) {
    return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: { state: COMPLETED, stateMessage: '' }
    })
  }

  async markFileAsFailed (file, errorMessage) {
    return ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
      id: file.id,
      params: { state: ERROR_SERVER, stateMessage: errorMessage }
    })
  }

  /* -- Import -- */

  async searchFilesFromFolder (folderPath) {
    const searchPaths = ['.']
    const files = []
    for (const searchPath of searchPaths) {
      const pa = path.join(folderPath, searchPath)
      files.push(...fileHelper.getFilesFromDirectoryPath(pa, true))
    }
    return files
  }

  async getDeviceInfoFromFolder (folder) {
    const files = await this.searchFilesFromFolder(folder)
    if (!files || files.length <= 0) { return null }
    // First wav file with duration
    for (let file of files) {
      if (dateHelper.getYear(file.name) > 1971 && fileHelper.getExtension(file.path) === 'wav' && fileHelper.getExtension(file.path) === 'wav' && await fileHelper.getFileDuration(file.path).catch(() => false)) {
        return this.getDeviceInfo(file)
      }
    }
  }

  async getDeviceInfo (file) {
    if (!file) return undefined
    try {
      // find AudioMoth metadata
      const audioMothFileInfo = await new FileInfo(file.path)
      if (audioMothFileInfo.comment) {
        return { deviceId: audioMothFileInfo.deviceId, deploymentId: audioMothFileInfo.deployment, timezoneOffset: audioMothFileInfo.timezoneOffset, recorderType: 'AudioMoth' }
      }
      // find frontier lab file
      const fileTimezone = await fileHelper.getFileTimezoneOffsetFromName(file.name)
      if (fileTimezone !== 0) {
        return { deviceId: '-1', deploymentId: null, timezoneOffset: fileTimezone, recorderType: 'FRONTIER LABS' }
      }
      // find SongMeter metadata
      file.extension = fileHelper.getExtension(file.name)
      const songMeterFileInfo = await extractSongMeterFileInfo(file)
      if (songMeterFileInfo.metadata) {
        return { deviceId: songMeterFileInfo.deviceId, deploymentId: songMeterFileInfo.deployment, timezoneOffset: songMeterFileInfo.timezoneOffset, recorderType: 'Song Meter' }
      }

      // return null if there is no metadata
      return null
    } catch (e) {
      return null
    }
  }

  /* -- Helper -- */

  createFileObject (filePath, stream, deploymentInfo = null) {
    const fileName = fileHelper.getFileNameFromFilePath(filePath)
    const fileExt = fileHelper.getExtension(fileName)

    // read deployment info
    let deviceId, deploymentId
    if (deploymentInfo) {
      deviceId = deploymentInfo.deviceId
      deploymentId = deploymentInfo.deploymentId
    }

    const size = fileHelper.getFileSize(filePath)
    const timestamp = dateHelper.getIsoDateWithFormat(stream.timestampFormat, fileName)
    const { state, message } = this.getState(timestamp, fileExt, size)

    return {
      id: this.getFileId(filePath),
      name: fileName,
      hash: '',
      sha1: '',
      path: filePath,
      extension: fileExt,
      sizeInByte: size,
      durationInSecond: -1,
      timestamp: timestamp,
      timezone: stream.timezone, // TODO: change to selected timezone (configure by user)
      streamId: stream.id,
      state: state,
      stateMessage: message,
      deviceId,
      deploymentId
    }
  }

  getState (timestamp, fileExt, sizeInByte) {
    const momentDate = dateHelper.getMomentDateFromISODate(timestamp)
    if (!fileHelper.isSupportedFileExtension(fileExt)) {
      return { state: ERROR_LOCAL, message: 'File extension is not supported.' }
    } else if (!momentDate.isValid()) {
      return { state: ERROR_LOCAL, message: 'Filename does not match with a filename format.' }
    } else if (sizeInByte === 0) {
      return { state: ERROR_LOCAL, message: 'Empty file (0 byte).' }
    } else if (momentDate.valueOf() <= dateHelper.getMomentDateFromISODatePast().valueOf()) {
      return { state: ERROR_LOCAL, message: 'Filename with date prior to 1971 is not permitted.' }
    } else {
      return { state: PREPARING, message: '' }
    }
  }

  getFileId (filePath) {
    return cryptoJS.MD5(filePath).toString() + '_' + Math.random().toString(36).substr(2, 9)
  }
}

export default new FileProvider()
