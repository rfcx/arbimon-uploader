import * as drivelist from 'drivelist'

class DriveListHelper {
  async getExternalDriveList () {
    const drives = await drivelist.list()
    console.log('getExternalDriveList: ', drives)
    return Promise.resolve(drives.filter(drive => drive.isCard || drive.isUSB).map(drive => this.toDriveObject(drive)).filter(item => item != null))
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
    return { id, path: drive.mountpoints[0].path, label: drive.mountpoints[0].label }
  }
}

export default new DriveListHelper()