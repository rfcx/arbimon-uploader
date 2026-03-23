const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

class DriveListHelper {
  async getExternalDriveList () {
    try {
      const drives = await this.listExternalDrives()
      return drives.map(drive => this.toDriveObject(drive)).filter(item => item != null)
    } catch (error) {
      console.error('[DriveList] Failed to enumerate drives', error)
      return []
    }
  }

  async listExternalDrives () {
    switch (process.platform) {
      case 'darwin':
        return this.listMacExternalDrives()
      case 'win32':
        return this.listWindowsExternalDrives()
      default:
        return this.listLinuxExternalDrives()
    }
  }

  listMacExternalDrives () {
    const volumesRoot = '/Volumes'
    const ignoredVolumes = new Set(['Macintosh HD', 'Preboot', 'Recovery', 'Update', 'VM'])
    if (!fs.existsSync(volumesRoot)) return []

    return fs.readdirSync(volumesRoot)
      .filter((name) => !ignoredVolumes.has(name))
      .map((name) => {
        const mountPath = path.join(volumesRoot, name)
        if (!fs.existsSync(mountPath)) return null

        return {
          device: mountPath,
          size: null,
          description: name,
          busType: 'External',
          mountpoints: [{ path: mountPath, label: name }]
        }
      })
      .filter((drive) => drive !== null)
  }

  async listWindowsExternalDrives () {
    const script = `
      $drives = Get-CimInstance Win32_DiskDrive | Where-Object { $_.InterfaceType -eq 'USB' -or $_.MediaType -match 'Removable' }
      $items = foreach ($drive in $drives) {
        $partitions = @(Get-CimAssociatedInstance -InputObject $drive -Association Win32_DiskDriveToDiskPartition)
        foreach ($partition in $partitions) {
          $logicalDisks = @(Get-CimAssociatedInstance -InputObject $partition -Association Win32_LogicalDiskToPartition)
          foreach ($logicalDisk in $logicalDisks) {
            [PSCustomObject]@{
              device = $drive.DeviceID
              size = [string]$drive.Size
              description = if ($drive.Model) { $drive.Model } else { $logicalDisk.VolumeName }
              busType = if ($drive.InterfaceType) { $drive.InterfaceType } else { 'USB' }
              mountpoints = @([PSCustomObject]@{
                path = "$($logicalDisk.DeviceID)\\"
                label = $logicalDisk.VolumeName
              })
            }
          }
        }
      }
      $items | ConvertTo-Json -Depth 4
    `
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    return this.parseCommandJson(stdout)
  }

  async listLinuxExternalDrives () {
    const { stdout } = await execFileAsync('lsblk', ['-J', '-o', 'NAME,SIZE,LABEL,MOUNTPOINT,RM,TRAN,TYPE'], {
      maxBuffer: 1024 * 1024
    })
    const data = stdout && stdout.trim().length > 0 ? JSON.parse(stdout) : {}
    const blockDevices = Array.isArray(data.blockdevices) ? data.blockdevices : []
    return blockDevices
      .flatMap((device) => this.flattenLinuxDevice(device))
      .filter((device) => device.mountpoints.length > 0)
  }

  flattenLinuxDevice (device) {
    const mountpoints = []
    if (device.mountpoint) {
      mountpoints.push({
        path: device.mountpoint,
        label: device.label || path.basename(device.mountpoint)
      })
    }

    const children = Array.isArray(device.children)
      ? device.children.flatMap((child) => this.flattenLinuxDevice({
        ...child,
        rm: child.rm !== undefined && child.rm !== null ? child.rm : device.rm,
        tran: child.tran || device.tran
      }))
      : []

    const isExternal = Number(device.rm) === 1 || device.tran === 'usb'
    const currentDevice = isExternal
      ? [{
        device: `/dev/${device.name}`,
        size: device.size,
        description: device.label || device.name,
        busType: device.tran || 'external',
        mountpoints
      }]
      : []

    return currentDevice.concat(children)
  }

  parseCommandJson (stdout) {
    if (!stdout || stdout.trim().length === 0) return []
    const parsed = JSON.parse(stdout)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  toDriveObject (drive) {
    if (!drive.mountpoints || drive.mountpoints.length === 0) return null
    const id = [
      drive.device,
      drive.size,
      drive.description,
      drive.mountpoints
        .map((m) => m.path)
        .sort()
        .join(',')
    ].join('|')
    const path = drive.mountpoints[0].path
    let label = drive.mountpoints[0].label
    if (!label || label.length === 0) { // if no name set
      label = drive.busType + ` ${path}`
    }
    return { id, path, label }
  }
}

export default new DriveListHelper()
