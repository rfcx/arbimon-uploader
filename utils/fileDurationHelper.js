/* eslint-disable no-unused-vars */
import * as ffprobe from '@ffprobe-installer/ffprobe'

import * as execa from 'execa'
import * as isStream from 'is-stream'
import { Readable as ReadableStream } from 'stream'

function getFFprobeWrappedExecution (input) {
  const params = [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_format',
    '-show_streams'
  ]

  const ffprobePath = ffprobe.path.replace('app.asar', 'app.asar.unpacked')

  if (typeof input === 'string') {
    return execa(ffprobePath, [...params, input])
  }

  if (isStream(input)) {
    return execa(ffprobePath, [...params, '-i', 'pipe:0'], {
      reject: false,
      input
    })
  }

  throw new Error('Given input was neither a string nor a Stream')
}

/**
 * Returns a promise that will be resolved with the duration of given audio in
 * seconds.
 *
 * @param  {string|ReadableStream} input Stream or path to file to be used as
 * input for `ffprobe`.
 *
 * @return {Promise} Promise that will be resolved with given audio duration in
 * seconds.
 */
async function getAudioDurationInSeconds (input) {
  try {
    const { stdout } = await getFFprobeWrappedExecution(input)
    const matched = stdout.match(/duration="?(\d*\.\d*)"?/)
    if (matched && matched[1]) return parseFloat(matched[1])
    throw new Error('No duration found!')
  } catch (error) {
    console.error('error: getAudioDurationInSeconds', error)
    throw new Error('Something went wrong. Please try again in a little later.')
  }
}

export default getAudioDurationInSeconds
export { getAudioDurationInSeconds }
