import dateHelper from './dateHelper'
import FileState from './fileState'
import settings from '../src/renderer/services/settings'
const { PREPARING, ERROR_SERVER, UPLOADING, PROCESSING, COMPLETED } = FileState.state

const getNameError = (streamName) => {
  if (!checkMinLength(streamName)) {
    return 'Minimum stream name length is 3 characters.'
  } else if (!checkMaxLength(streamName)) {
    return 'Maximum stream name length is 40 characters.'
  }
}

const isValidName = (streamName) => {
  return checkMinLength(streamName) && checkMaxLength(streamName)
}

const checkMinLength = (streamName) => {
  return streamName.trim().length && streamName.trim().length > 2
}

const checkMaxLength = (streamName) => {
  return streamName.trim().length && streamName.trim().length <= 40
}

const getState = function (stream) {
  const stats = stream.stats
  if (!stats || stats.length <= 0) return ''
  if (stats.find(stat => FileState.isInQueuedGroup(stat.state))) return UPLOADING
  if (stats.find(stat => FileState.isProcessing(stat.state))) return PROCESSING
  if (stats.find(stat => FileState.isError(stat.state))) return ERROR_SERVER
  if (stats.find(stat => FileState.isInPreparedGroup(stat.state))) return PREPARING
  if (stats.find(stat => FileState.isInCompletedGroup(stat.state))) return COMPLETED
  return ''
}

const hasErrorState = function (stream) {
  const stats = stream.stats
  return stats.find(stat => FileState.isError(stat.state))
}

const parseUserSites = (sites) => {
  return sites.map((site) => {
    return parseSite(site)
  })
}

const parseSite = (site) => {
  const latitude = site.latitude || 0
  const longitude = site.longitude || 0
  const project = site.project
  return {
    id: site.id,
    name: site.name,
    timestampFormat: 'Auto-detect',
    latitude: latitude,
    longitude: longitude,
    files: [],
    serverCreatedAt: new Date(site.created_at),
    serverUpdatedAt: new Date(site.updated_at),
    env: isProductionEnv() ? 'production' : 'staging',
    visibility: site.is_public,
    timezone: dateHelper.getDefaultTimezone(latitude, longitude),
    projectId: project ? project.id : (site.projectId || null),
    projectName: project ? project.name : (site.projectName || null)
  }
}

const isProductionEnv = () => {
  return settings.get('settings.production_env')
}

const sortAlphaNumericArray = (array) => {
  if (array && !array.length) return []
  return array.sort(function (a, b) {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
  })
}

const sortByKeywordArray = function (array, keyword) {
  if (array && !array.length) return []
  return array.filter(item => {
    // Filter results by doing case insensitive match on name
    return item.name.toLowerCase().includes(keyword.toLowerCase())
  }).sort((a, b) => {
    // Sort results by matching name with keyword position in name
    if (a.name.toLowerCase().indexOf(keyword.toLowerCase()) > b.name.toLowerCase().indexOf(keyword.toLowerCase())) {
      return 1
    } else if (a.name.toLowerCase().indexOf(keyword.toLowerCase()) < b.name.toLowerCase().indexOf(keyword.toLowerCase())) {
      return -1
    } else {
      if (a.name > b.name) return 1
      else return -1
    }
  })
}

export default {
  isValidName,
  getNameError,
  parseUserSites,
  parseSite,
  getState,
  hasErrorState,
  sortAlphaNumericArray,
  sortByKeywordArray
}
