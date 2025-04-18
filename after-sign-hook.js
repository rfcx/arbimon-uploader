const fs = require('fs')
const path = require('path')
let electronNotarize = require('electron-notarize')
const dotenv = require('dotenv')
dotenv.config()

module.exports = async function (params) {
  // Only notarize the app on Mac OS only.
  if (process.platform !== 'darwin') {
    return
  }
  // Same appId in electron-builder.
  let appId = 'org.rfcx.ingest'
  let appPath = path.join(params.appOutDir, `${params.packager.appInfo.productFilename}.app`)
  if (!fs.existsSync(appPath)) {
    throw new Error(`Cannot find application at: ${appPath}`)
  }
  // console.log(`Notarizing ${appId} found at ${appPath}`)
  try {
    await electronNotarize.notarize({
      appBundleId: appId,
      appPath: appPath,
      appleApiKey: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_KEY_ISSUER_ID,
      tool: 'notarytool'
    })
  } catch (error) {
    console.error('Error notarizing', error)
  }
  console.log(`Notarizing is finished`)
}
