const { execFileSync } = require('child_process')

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

const electronBuilderCli = require.resolve('electron-builder/out/cli/cli.js')

execFileSync(process.execPath, [electronBuilderCli, 'install-app-deps'], {
  stdio: 'inherit'
})
