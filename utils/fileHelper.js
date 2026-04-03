import FileTimezoneHelper from './FileTimezoneHelper'
import audioService from '../services/audio'
import FileInfo from '../src/renderer/services/FileInfo'
const sha1File = require('sha1-file')
const fs = require('fs')
const path = require('path')
const moment = require('moment-timezone')
const archiver = require('archiver')
const { RIFFFile } = require('riff-file')
const { unpackString } = require('byte-data')

const dayInMs = 1000 * 60 * 60 * 24

const getFilePath = (directoryPath, fileName) => {
  return path.join(directoryPath, fileName)
}

const isExist = (path) => {
  return fs.existsSync(path)
}

const isFolder = (filePath) => {
  return fs.lstatSync(filePath).isDirectory()
}

const readFile = (filePath) => {
  return fs.readFileSync(filePath)
}
/** Function to read SongMeter metadata in GUAN format */
const readGuanMetadata = (filePath) => {
  const wavFile = fs.readFileSync(filePath)
  const riff = new RIFFFile()
  riff.setSignature(wavFile)
  const guanChunk = riff.findChunk('guan')
  return guanChunk ? unpackString(wavFile, guanChunk.chunkData.start, guanChunk.end) : null
}

const getExtension = (fileName) => {
  return fileName.split('.').pop().toLowerCase()
}

const getFilesFromDirectoryPath = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) { return [] }
  if (!fs.lstatSync(directoryPath).isDirectory()) { return [] }
  const filesSortByRecent = fs.readdirSync(directoryPath).filter(item => !(/(^|\/)\.[^/.]/g).test(item))
    .filter(file => fs.lstatSync(path.join(directoryPath, file)).isFile())
    .map(file => ({ name: file, mtime: fs.lstatSync(path.join(directoryPath, file)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime)
  return filesSortByRecent.map(item => ({name: item.name, path: directoryPath + '/' + item.name, lastModified: item.mtime}))
}

const getCheckSum = (filePath) => {
  const checksum = sha1File(filePath)
  return checksum
}

const getFileNameFromFilePath = (filePath) => {
  return path.parse(filePath).base
}

const getDirectoryFromFilePath = (filePath) => {
  return path.dirname(filePath)
}

const getFileName = (fileName) => {
  const ext = '.' + getExtension(fileName)
  return fileName.replace(ext, '')
}

const getFileSize = (filePath) => {
  const stats = fs.statSync(filePath)
  return stats.size
}

const getDisplayFileDuration = (file) => {
  if (file.durationInSecond < 0) {
    return '-'
  }
  let date = new Date(0)
  date.setSeconds(file.durationInSecond)
  return date.toISOString().substr(11, 8)
}

const getDisplayTimestamp = (file) => {
  return moment.parseZone(file.timestamp).format('YYYY-MM-DD HH:mm:ss')
}

const getDisplayFileSize = (file) => {
  const bytes = file.sizeInByte
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return '0 Byte'
  var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)))
  return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i]
}

const getUtcTimestamp = (file) => {
  if (file.timestamp.substr(-1) === 'Z' || file.timestamp.substr(-6, 1) === '-' || file.timestamp.substr(-6, 1) === '+') {
    return moment.utc(file.timestamp).toISOString() // timezone is in the parsed timestamp
  }
  if (Number.isInteger(parseInt(file.timezone))) {
    return moment.utc(file.timestamp).utcOffset(parseInt(file.timezone), true).toISOString()
  }
  if (!file.timezone || file.timezone === FileTimezoneHelper.fileTimezone.UTC || file.timezone === '') {
    return file.timestamp + 'Z' // assume file that doesn't have timezone provided is in UTC)
  }
  return moment.tz(file.timestamp, file.timezone).toISOString() // parse with timezone and return as UTC
}

const getFileDuration = async (filePath) => {
  try {
    const fileInfo = await new FileInfo(filePath)
    if (!fileInfo || !fileInfo.duration || fileInfo.duration === 0) {
      throw new Error('No duration found!')
    }
    return fileInfo.duration
  } catch (error) {
    throw error
  }
}

const isSupportedFileExtension = (fileExtension) => {
  let extension = fileExtension.toLowerCase()
  return ['wav', 'opus', 'flac'].includes(extension)
}

const isOutdatedFile = (file) => {
  return file.uploadedTime && Date.now() - parseInt(file.uploadedTime) > dayInMs * 30
}

// keep retring for preventing EPREM error (https://stackoverflow.com/questions/39293636/npm-err-error-eperm-operation-not-permitted-rename/45840283)
const rename = (path, newPath, maxRetires) => new Promise((resolve, reject) => {
  fs.rename(path, newPath, e => {
    if (e && (e.code === 'EACCES' || e.code === 'EPERM') && maxRetires > 0) {
      maxRetires--
      return rename(path, newPath, maxRetires).then(resolve).catch(reject)
    } else if (e) {
      reject(e)
    } else {
      resolve(newPath)
    }
  })
})

const getTempPath = (tmpPath, fileName, streamId) => {
  return `${tmpPath}/${fileName}-${streamId}`
}

const convert = (sourceFile, tempPath, streamId, metadata) => {
  const destinationPath = `${getTempPath(tempPath, getFileNameFromFilePath(sourceFile), streamId)}.flac`
  console.info('[FileHelper] converting: ', sourceFile, destinationPath)
  return audioService.convert(sourceFile, destinationPath, metadata)
}

const remove = (path) => {
  return new Promise((resolve, reject) => {
    fs.unlink(path, (err) => {
      if (err) {
        console.error(err)
        reject(err)
      } else {
        resolve('file delete successfully')
      }
    })
  })
}

const archiverDirectory = (sourceDirectory, targetFileName) => {
  var output = fs.createWriteStream(`${targetFileName}.zip`)
  var archive = archiver('zip')

  output.on('close', function () {
    console.info(`[Archiver] log file created at ${targetFileName}.zip (${archive.pointer()} total bytes)`)
  })

  archive.on('error', function (err) {
    throw err
  })

  archive.pipe(output)

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory(sourceDirectory, false)

  // append files from a sub-directory and naming it `new-subdir` within the archive
  archive.directory('subdir/', 'new-subdir')

  archive.finalize()
}

const getFileTimezoneOffsetFromName = (name) => {
  // expected format: 20231119T210000+0930_REC_-13.64526+134.30475
  const pattern = /((?<year>(19|20)[0-9][0-9])[- /.]?(?<month>0[1-9]|1[012])[- /.]?(?<day>0[1-9]|[12][0-9]|3[01]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9])?(?<timezone>([+ -])\d*))/ig
  const pattern2 = /((?<year>(19|20)[0-9][0-9])[- /.]?(?<month>0[1-9]|1[012])[- /.]?(?<day>0[1-9]|[12][0-9]|3[01]).?(?<hour>[0-1][0-9]|2[0-3])[- :.]?(?<minute>[0-5][0-9])[- :.]?(?<second>[0-5][0-9]).?(?<milisecond>[0-9][0-9][0-9][0-9][0-9][0-9])?(?<timezone>([+ -])\d*))/ig

  const regExp = new RegExp(pattern, 'g')
  var result = regExp.exec(name)

  if (result === null || (result && result.groups && !result.groups.timezone)) {
    const regExp2 = new RegExp(pattern2, 'g')
    result = regExp2.exec(name)
    if (result === null || (result && result.groups && !result.groups.timezone)) return 0
  }
  return moment.parseZone(result[0]).utcOffset()
}

export default {
  getFilesFromDirectoryPath,
  readFile,
  readGuanMetadata,
  isExist,
  getFilePath,
  getFileNameFromFilePath,
  getDirectoryFromFilePath,
  getFileName,
  getExtension,
  getFileSize,
  getDisplayFileDuration,
  getDisplayTimestamp,
  getDisplayFileSize,
  getUtcTimestamp,
  getFileTimezoneOffsetFromName,
  getFileDuration,
  isSupportedFileExtension,
  isFolder,
  getCheckSum,
  isOutdatedFile,
  rename,
  convert,
  remove,
  archiverDirectory
}
