import fileHelper from './fileHelper'
import fileState from './fileState'
import errors from './errors'
import { createAnalytics } from '../src/renderer/services/analytics'
import settings from '../src/renderer/services/settings'
import ipcRendererSend from '../src/renderer/services/ipc'
import remote from '../src/renderer/services/remote'

const { CONVERTING, UPLOADING } = fileState.state

const axios = require('axios')
const fileStreamAxios = axios.create({
  adapter: require('./axios-http-adapter').default
})
const httpClient = axios.create()
httpClient.defaults.timeout = 30000
const env = require('../env.json')

const apiUrl = (proEnvironment) => {
  const url = remote.getGlobal('ingestServicelUrl')
  if (url) { return url } // local url provided
  return proEnvironment ? env.ingestApi : env.staging.ingestApi
}

const explorerWebUrl = (isProd, streamId = null) => {
  let baseUrl = isProd ? env.explorerUrl : env.staging.explorerUrl
  let query = streamId ? `?stream=${streamId}` : ''
  return baseUrl + query
}

const arbimonWebUrl = (isProd, streamId = null) => {
  const baseUrl = isProd ? env.arbimonUrl : env.staging.arbimonUrl
  const query = '/my-projects'
  return baseUrl + query
}

const uploadFile = async (environment, fileId, fileName, filePath, fileExt, streamId, timestamp, duration, fileSize, idToken, metadata, progressCallback) => {
  const now = Date.now()
  const analytics = createAnalytics(env.analytics.id)
  console.log(`===> upload file ${fileName}`)
  let isConverted = false
  let uploadFilePath = filePath
  let uploadFileExt = fileExt
  if (fileExt === 'wav') {
    try {
      await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
        id: fileId,
        params: { state: CONVERTING, uploaded: false }
      })
      uploadFilePath = (await fileHelper.convert(filePath, remote.app.getPath('temp'), streamId, metadata)).path
      uploadFileExt = 'flac'
      isConverted = true
      console.info('[API] update upload path', uploadFilePath, uploadFileExt, fileName)
    } catch (error) {
      console.error('error', error)
    }
  }
  return requestUploadUrl(environment, fileName, uploadFilePath, streamId, timestamp, duration, fileSize, idToken)
    .then(async (data) => {
      const getUploadIdTime = Date.now() - now
      const analyticsEventObj = { 'ec': env.analytics.category.time, 'ea': env.analytics.action.getUploadId, 'el': fileName, 'ev': getUploadIdTime }
      await analytics.send('event', analyticsEventObj)
      await ipcRendererSend('db.files.update', `db.files.update.${Date.now()}`, {
        id: fileId,
        params: { state: UPLOADING, uploadId: data.uploadId, progress: 0, uploaded: false }
      })
      return performUpload(data.url, data.uploadId, uploadFilePath, uploadFileExt, progressCallback).then(async () => {
        const uploadTime = Date.now() - now
        const analyticsEventObj = { 'ec': env.analytics.category.time, 'ea': env.analytics.action.upload, 'el': fileName, 'ev': uploadTime }
        await analytics.send('event', analyticsEventObj)
        if (isConverted) {
          fileHelper.remove(uploadFilePath)
        }
        return data.uploadId
      })
    })
}

// Part 0: Create stream
const createStream = (env, streamName, latitude, longitude, isPublic, projectId, idToken) => {
  console.info('[API] creating stream api', streamName)
  return httpClient.post(apiUrl(env) + '/streams', { name: streamName, latitude: latitude, longitude: longitude, is_public: isPublic, project_id: projectId }, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(function (response) {
      const streamId = response.data.id
      return streamId
    }).catch(error => {
      console.error('error response', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

// Part 1: Get signed url

const requestUploadUrl = (env, originalFilename, filePath, streamId, timestamp, duration, fileSize, idToken) => {
  // Make a request for a user with a given ID
  console.info('[API] requestUploadUrl', originalFilename)
  const sha1 = fileHelper.getCheckSum(filePath)
  const params = { filename: originalFilename, checksum: sha1, stream: streamId, timestamp: timestamp, duration: duration, file_size: fileSize }
  return httpClient.post(apiUrl(env) + '/uploads', params, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(response => {
      const url = response.data.url
      const uploadId = response.data.uploadId
      return { url, uploadId }
    }).catch(error => {
      throw errors.matchAxiosErrorToRfcx(error)
    })
}

// Part 2: Upload

const fs = require('fs')

function performUpload (signedUrl, signId, filePath, fileExt, progressCallback) {
  console.log(`===> performUpload to upload file ${signId}`)
  var headers = {
    'Content-Type': `audio/${fileExt}`
  }
  // S3 doesn't allow chunked uploads, so setting the Content-Length is required
  const fileSize = fileHelper.getFileSize(filePath)
  headers['Content-Length'] = fileSize
  const readStream = fs.createReadStream(filePath)
  const options = {
    headers: headers,
    maxContentLength: 209715200,
    onUploadProgress: function (progressEvent) {
      const progress = parseInt(Math.round((progressEvent.loaded * 100) / progressEvent.total))
      progressCallback(progress)
    }
  }
  return fileStreamAxios.put(signedUrl, readStream, options)
}

// Part 3: Get ingest status

const checkStatus = (env, uploadId, idToken) => {
  return httpClient.get(apiUrl(env) + '/uploads/' + uploadId, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(function (response) {
      const status = response.data.status
      const failureMessage = response.data.failureMessage
      return { status: status, failureMessage: failureMessage }
    }).catch(error => {
      console.error('error', error, error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

const getStream = (streamId, idToken) => {
  const env = settings.get('settings.production_env')
  return httpClient.get(apiUrl(env) + `/streams/${streamId}`, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(response => {
      return response.data
    }).catch(error => {
      throw errors.matchAxiosErrorToRfcx(error)
    })
}

const updateStream = (env, streamId, opts, idToken) => {
  return httpClient.patch(apiUrl(env) + `/streams/${streamId}`, opts, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(function (response) {
      return response.data
    }).catch(error => {
      console.error('error', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

const renameStream = (env, streamId, streamName, streamSite, idToken) => {
  return httpClient.patch(apiUrl(env) + `/streams/${streamId}`, { name: streamName, site: streamSite }, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(function (response) {
      return response.data
    }).catch(error => {
      console.error('error', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

const deleteStream = (env, streamId, idToken) => {
  return httpClient.delete(apiUrl(env) + `/streams/${streamId}`, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(function (response) {
      return response.data
    }).catch(error => {
      console.error('error', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

const getUserSites = (idToken, keyword = null, projectId, limit, offset) => {
  const env = settings.get('settings.production_env')
  let params = { keyword, projects: projectId }
  if (typeof limit === 'number') { params.limit = limit }
  if (typeof offset === 'number') { params.offset = offset }
  return httpClient.get(apiUrl(env) + `/streams`, { headers: { 'Authorization': 'Bearer ' + idToken }, params })
    .then(function (response) {
      return response.data
    }).catch(error => {
      console.error('error', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

const getDeploymentInfo = (deploymentId, idToken) => {
  const env = settings.get('settings.production_env')
  return httpClient.get(apiUrl(env) + `/deployments/${deploymentId}`, { headers: { 'Authorization': 'Bearer ' + idToken } })
    .then(response => {
      return response.data
    }).catch(error => {
      throw errors.matchAxiosErrorToRfcx(error)
    })
}

const getUserProjects = (idToken, keyword = null) => {
  const env = settings.get('settings.production_env')
  return httpClient.get(apiUrl(env) + `/projects`, { headers: { 'Authorization': 'Bearer ' + idToken }, params: { keyword } })
    .then(function (response) {
      return response.data
    }).catch(error => {
      console.error('error', error.response)
      throw error.response ? (error.response.data ? error.response.data : error.response) : error
    })
}

export default {
  explorerWebUrl,
  arbimonWebUrl,
  createStream,
  updateStream,
  getStream,
  uploadFile,
  checkStatus,
  renameStream,
  deleteStream,
  getUserSites,
  getDeploymentInfo,
  getUserProjects
}
