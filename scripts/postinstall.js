const { execFileSync } = require('child_process')
const path = require('path')

function shouldSkipNativeRebuild () {
  if (process.env.SKIP_ELECTRON_REBUILD === '1') return true

  return process.platform === 'darwin' &&
    process.arch === 'arm64'
}

if (shouldSkipNativeRebuild()) {
  console.warn('[postinstall] Skipping electron-builder install-app-deps on darwin arm64.')
  console.warn('[postinstall] Native modules should be rebuilt on the target CI/release platform instead.')
  process.exit(0)
}

const electronBuilderBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
)

execFileSync(electronBuilderBin, ['install-app-deps'], {
  stdio: 'inherit'
})
