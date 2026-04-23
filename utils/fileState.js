const state = {
  PREPARING: 10, // in prepare tab
  ERROR_LOCAL: 20, // e.g. file not found, file not support
  ERROR_SERVER: 21, // e.g. duplicated, network error
  DUPLICATED: 22, // specified case for server error
  CONVERTING: 30, // converting to flac
  UPLOADING: 31, // uploading to server
  WAITING: 32, // in queue waiting to upload
  PROCESSING: 40, // uploaded, but in process of a.k.a. verifing / ingesting
  COMPLETED: 50 // uploaded and ingested
}

const preparedGroup = [state.PREPARING, state.ERROR_LOCAL]
const queuedGroup = [state.WAITING, state.UPLOADING, state.CONVERTING]
const completedGroup = [state.COMPLETED, state.PROCESSING, state.ERROR_SERVER]

const cannotRedoGroup = ['duplicate', 'corrupt', 'duration', 'project recording-minute limit exceeded']

const mapPossibleStatesWithId = function () {
  let stateObject = {}
  for (const [key, id] of Object.entries(state)) {
    switch (key) {
      case 'ERROR_LOCAL':
        stateObject[`${id}`] = ['local_error']
        break
      case 'ERROR_SERVER':
        stateObject[`${id}`] = ['server_error', 'failed']
        break
      case 'PROCESSING':
        stateObject[`${id}`] = ['processing', 'ingesting']
        break
      default:
        stateObject[`${id}`] = [key.toLowerCase()]
    }
  }
  return stateObject
}

const getStateByStateId = function (id) {
  return Object.keys(state).find(key => state[key] === id)
}

const getStatePriority = function (id) {
  switch (id) {
    case state.PREPARING: return 0
    case state.CONVERTING:
    case state.UPLOADING: return 1
    case state.ERROR_LOCAL:
    case state.ERROR_SERVER: return 2
    case state.DUPLICATED: return 2
    case state.WAITING: return 3
    case state.PROCESSING: return 4
    case state.COMPLETED: return 7
    default: return 8
  }
}

const getSummaryStatePriority = function (id) {
  switch (id) {
    case state.PROCESSING: return 0
    case state.COMPLETED: return 10
    case state.ERROR_LOCAL:
    case state.ERROR_SERVER: return 20
    default: return 30
  }
}

const getName = function (id, message) {
  switch (id) {
    case state.PREPARING: return ''
    case state.CONVERTING: return 'compressing'
    case state.WAITING: return 'waiting'
    case state.UPLOADING: return 'uploading'
    case state.PROCESSING: return 'verified'
    case state.ERROR_LOCAL:
    case state.ERROR_SERVER:
      // if (!message) return ''
      if (message && message.toLowerCase().includes('duplicate')) return 'duplicate'
      else return 'failed'
    case state.COMPLETED: return 'completed'
  }
}

const getIconName = function (id) {
  switch (id) {
    case state.PREPARING:
    case state.WAITING:
      return 'ic-state-waiting.svg'
    case state.CONVERTING:
    case state.UPLOADING:
      return 'ic-state-uploading.svg'
    case state.PROCESSING:
      return 'ic-state-ingesting.svg'
    case state.ERROR_LOCAL:
    case state.ERROR_SERVER:
    case state.DUPLICATED:
      return 'ic-state-failed.svg'
    case state.COMPLETED:
      return 'ic-state-completed.svg'
  }
}
const isInPreparedGroup = function (state) {
  return preparedGroup.includes(state)
}

const isInQueuedGroup = function (state) {
  return queuedGroup.includes(state)
}

const isInCompletedGroup = function (state) {
  return completedGroup.includes(state)
}

const isPreparing = function (s) {
  return s === state.PREPARING
}

const isWaiting = function (s) {
  return s === state.WAITING
}

const isLocalError = function (s) {
  return s === state.ERROR_LOCAL
}

const isServerError = function (s) {
  return s === state.ERROR_SERVER
}

const isError = function (state) {
  return isLocalError(state) || isServerError(state) || isDuplicated(state)
}

const isProcessing = function (s) {
  return s === state.PROCESSING
}

const isDuplicated = function (s) {
  return s === state.DUPLICATED
}

const isCompleted = function (s) {
  return s === state.COMPLETED
}

const canRedo = function (s, message) {
  if (!message) return false
  return s === state.ERROR_SERVER && !cannotRedoGroup.some(errMsg => message.toLowerCase().includes(errMsg))
}

const canRemove = function (state) {
  return isError(state) || isInPreparedGroup(state)
}

const canChangeTimestampFormat = function (state, message) {
  return isInPreparedGroup(state) && !(message.toLowerCase().includes('extension') || message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('duration'))
}

export default {
  state,
  mapPossibleStatesWithId,
  getStateByStateId,
  preparedGroup,
  queuedGroup,
  completedGroup,
  getStatePriority,
  getSummaryStatePriority,
  getName,
  getIconName,
  isInPreparedGroup,
  isInQueuedGroup,
  isInCompletedGroup,
  isPreparing,
  isWaiting,
  isLocalError,
  isServerError,
  isError,
  isProcessing,
  isDuplicated,
  isCompleted,
  cannotRedoGroup,
  canRedo,
  canRemove,
  canChangeTimestampFormat
}
