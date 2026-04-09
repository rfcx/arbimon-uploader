const ffmpeg = require('fluent-ffmpeg')

let isConfigured = false

const normalizeBinaryPath = (binaryPath) => binaryPath.replace('app.asar', 'app.asar.unpacked')

const loadFfmpegInstallerPath = () => require('@ffmpeg-installer/ffmpeg').path

const loadFfprobeInstallerPath = () => require('@ffprobe-installer/ffprobe').path

const resolveBinaryPath = (loadInstallerPath, envVarName, defaultBinaryName, packageName) => {
  if (process.env[envVarName]) {
    return process.env[envVarName]
  }

  try {
    return normalizeBinaryPath(loadInstallerPath())
  } catch (error) {
    if (error && /Unsupported platform\/architecture/.test(String(error))) {
      console.warn(`[Audio] ${packageName} unavailable for ${process.platform}-${process.arch}, falling back to ${defaultBinaryName} from PATH`)
      return defaultBinaryName
    }

    throw error
  }
}

const configureBinaryPaths = () => {
  if (isConfigured) return

  ffmpeg.setFfmpegPath(resolveBinaryPath(loadFfmpegInstallerPath, 'FFMPEG_PATH', 'ffmpeg', '@ffmpeg-installer/ffmpeg'))
  ffmpeg.setFfprobePath(resolveBinaryPath(loadFfprobeInstallerPath, 'FFPROBE_PATH', 'ffprobe', '@ffprobe-installer/ffprobe'))
  isConfigured = true
}

/**
   * convert wav files to flac
   * @returns desination path of the converted file
   */
const convert = (sourceFile, destinationPath, metadata) => {
  configureBinaryPaths()
  const basedOutputOptions = ['-ac 1'] // force convert to mono channel
  const meta = metadata ? ['-metadata', `comment=${metadata.comment}`, '-metadata', `artist=${metadata.artist}`] : []
  const outputOptions = basedOutputOptions.concat(meta)
  return new Promise((resolve, reject) => {
    const command = ffmpeg(sourceFile)
      .noVideo()
      .output(destinationPath)
      .outputOptions(outputOptions)

    const timeout = setTimeout(function () {
      command.kill()
      reject(Error('Timeout')) // TODO: move to errors
    }, 60000)

    command
      .on('error', function (err, stdout, stderr) {
        clearTimeout(timeout)
        reject(err)
      })
      .on('end', async function (stdout, stderr) {
        clearTimeout(timeout)
        try {
          resolve({
            path: destinationPath
          })
        } catch (e) { reject(e) }
      })
      .run()
  })
}

/**
 * Probe an audio file to find its sample rate, duration and other meta data
 * - result: { format: 'wav', duration: 1.5, comment: 'Recorded at {DATE} {TIMEZONE} during deployment {DEPLOYMENT_ID} at {GAIN} setting while {BATTERY} and {TEMPERTURE}', artist: 'AudioMoth {DEVICE_ID}' }
 * @param {String} sourceFile - path to source file on disk
 * @returns {Promise<Object>} - an object containing the meta data
 */
const identify = (sourceFile) => {
  configureBinaryPaths()
  return new Promise((resolve, reject) => {
    ffmpeg(sourceFile)
      .ffprobe(0, function (err, result) {
        if (err) {
          console.error('[Audio] identify error for:', sourceFile, err)
          reject(err)
        } else {
          try {
            const format = result.format && result.format.format_name ? result.format.format_name : undefined
            let duration = result.format && parseFloat(result.format.duration)

            // Fallback for duration if format.duration is missing/NaN
            if ((!duration || isNaN(duration)) && result.streams && result.streams[0]) {
              duration = parseFloat(result.streams[0].duration)
            }

            const tags = result.format.tags
            const artist = tags && tags.artist
            const comment = tags && tags.comment

            if (!duration || isNaN(duration)) {
              console.warn('[Audio] No duration found for:', sourceFile, JSON.stringify(result.format))
            }

            resolve({ format, duration, comment, artist })
          } catch (e) {
            console.error('[Audio] Error parsing ffprobe result:', e)
            reject(e)
          }
        }
      })
  })
}

export default {
  convert,
  identify
}
