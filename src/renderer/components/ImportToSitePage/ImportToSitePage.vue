<template>
  <div class="wrapper">
    <div class="header">
      <header-view title="Select Site" :shouldShowBackButton="true"/>
      <div class="tag__wrapper">
        <RecorderTag :show="props.deviceId" :isSelected="true" :type="props.recorderType"/>
        <deployment-tag 
          v-if="isFetchingDeploymentInfo || props.deploymentId"
          :isChecking="isFetchingDeploymentInfo"
          :isDetected="props.deploymentId !== null && deploymentInfo !== null"
          :isNotMatched="!isSelectedSiteMatchWithDetectedDeployment"
        />
      </div>
    </div>
    <fieldset>
      <div class="notification default-notice" v-if="errorMessage">
        <button class="delete" @click="errorMessage = ''"></button>
        {{ errorMessage }}
      </div>
      <div class="field field-dropdown" v-if="shouldShowProjectSelector">
        <label for="project" class="label">
          Project name
        </label>
        <SelectProjectDropDownInput
        :helpText="siteDropdownHelpText"
        :initialProject="preselectedProject"
        :disabled="isFetchingDeploymentInfo"
        @onSelectedProjectNameChanged="onSelectedProject"/>
      </div>
      <div class="field field-dropdown" :class="{'field-dropdown-with-help': siteDropdownHelpText !== null}">
        <label for="name" class="label">
          Site name
          <span class="help is-warning" v-if="shouldShowNameHelperMessage">You must enter a site name</span>
        </label>
        <SelectSiteDropdownInput
        ref="siteSelector"
        :project="selectedProject"
        :updateIsCreatingNewSite.sync="isCreatingNewSite"
        :isWarning="shouldShowNameHelperMessage === true || shouldShowDetectedSiteWarning === true"
        :initialSite="preselectedSite"
        :helpText="siteDropdownHelpText"
        :disabled="isFetchingDeploymentInfo"
        @onSelectedSiteNameChanged="onSelectedSite"/>
      </div>
      <div class="field">
        <label for="location" class="label">Location</label>
        <Map class="map-wrapper" @locationSelected="onUpdateLocation" :initialCoordinates="selectedCoordinates" :isReadOnly="!isCreatingNewSite" ref="map"></Map>
      </div>
      <div class="field is-grouped controls-group">
        <p class="control control-btn">
          <router-link class="control-btn" to="/">
            <button type="button" class="button is-rounded is-cancel">Cancel</button>
          </router-link>
        </p>
        <p class="control control-btn">
          <button
            type="button"
            class="button is-rounded is-primary"
            :class="{ 'is-loading': isLoading }"
            :disabled="!hasPassedValidation"
            @click.prevent="importFiles"
          >{{ actionButtonTitle }}</button>
        </p>
      </div>
    </fieldset>
  </div>
</template>

<script>
import Map from '../Common/Map/Map'
import RecorderTag from '../Common/Tag/RecorderTag'
import DeploymentTag from '../Common/Tag/DeploymentTag'
import HeaderView from '../Common/HeaderWithBackButton'
import SelectProjectDropDownInput from './SelectProjectDropDownInput'
import SelectSiteDropdownInput from './SelectSiteDropDownInput'
import api from '../../../../utils/api'
import fileHelper from '../../../../utils/fileHelper'
import ipcRendererSend from '../../services/ipc'
import settings from '../../services/settings'
import streamHelper from '../../../../utils/streamHelper'
import streamService from '../../services/stream'
import FileTimezoneHelper from '../../../../utils/FileTimezoneHelper'

export default {
  data () {
    return {
      form: {
        selectedProjectName: '',
        selectedSiteName: '',
        selectedLatitude: null,
        selectedLongitude: null
      },
      props: {
        deploymentId: null,
        deviceId: null,
        recorderType: null,
        deploymentConfiguredTimeZone: null,
        selectedFolderPath: null,
        selectedFiles: null,
        currentActiveSite: null
      },
      selectedProject: null,
      selectedExistingSite: null,
      deploymentInfo: null,
      isLoading: false,
      isFetchingDeploymentInfo: false,
      isCreatingNewSite: true,
      errorMessage: ''
    }
  },
  components: { Map, RecorderTag, DeploymentTag, HeaderView, SelectSiteDropdownInput, SelectProjectDropDownInput },
  async created () {
    if (!this.$route.query) return
    // TODO: add logic & UI to go back to import step

    // handle selected folder / files
    if (this.$route.query.folderPath) {
      this.props.selectedFolderPath = this.$route.query.folderPath
    } else if (this.$route.query.selectedFiles) {
      this.props.selectedFiles = JSON.parse(this.$route.query.selectedFiles)
    }

    if (this.$route.query.currentActiveSite) {
      this.props.currentActiveSite = JSON.parse(this.$route.query.currentActiveSite)
      this.updateSelectedExistingSite(this.preselectedSite) // update site
    }

    this.props.deploymentId = this.$route.query.deploymentId
    this.props.deviceId = this.$route.query.deviceId
    this.props.recorderType = this.$route.query.recorderType

    const deviceInfo = await this.extractDeviceInfoFromQuery()
    if (deviceInfo) {
      this.props.deviceId = deviceInfo.deviceId
      this.props.deploymentId = deviceInfo.deploymentId
      this.props.deploymentConfiguredTimeZone = deviceInfo.timezoneOffset
      this.props.recorderType = deviceInfo.recorderType
    }

    if (this.props.deviceId && !this.props.deploymentId) { // show protip
      const recorderType = this.props.recorderType
      this.errorMessage = `Suggestion: use the Arbimon Companion to deploy your ${recorderType} device in the future to pre-populate the site name below.`
    }

    if (this.props.deploymentId) {
    // get deployment info
      this.isFetchingDeploymentInfo = true
      try {
        this.deploymentInfo = await this.getDeploymentInfo(this.props.deploymentId)
      } catch (error) {
        switch (error.name) {
          case 'EmptyResultError':
            this.errorMessage = 'Site with attached deployment could not be found. Please manually select a site.'
            break
          case 'ForbiddenError':
            this.errorMessage = `You don't have permission to the site with attached deployment. Please manually select a site.`
            break
          default:
            this.errorMessage = error.message
        }
      }
      this.isFetchingDeploymentInfo = false
    }
    if (this.preselectedSite && this.preselectedSite.id) { // has stream infomation attached to deployment info
      // and set the selected site to be the detected site from deployment
      this.updateSelectedExistingSite(this.preselectedSite)
    }

    // check if site detected
    if (this.preselectedProject) {
      this.selectedProject = this.preselectedProject
    }
  },
  computed: {
    detectedSiteFromDeployment () {
      if (this.deploymentInfo && this.deploymentInfo.stream) {
        return streamHelper.parseSite(this.deploymentInfo.stream)
      } else {
        return null
      }
    },
    detectedProjectFromDeployment () {
      if (this.detectedSiteFromDeployment && this.detectedSiteFromDeployment.projectName && this.detectedSiteFromDeployment.projectId) {
        return { id: this.detectedSiteFromDeployment.projectId, name: this.detectedSiteFromDeployment.projectName }
      }
      return null
    },
    preselectedSite () {
      const currentSelectedSiteInGlobalNavigation = this.props.currentActiveSite
      if (currentSelectedSiteInGlobalNavigation) {
        return currentSelectedSiteInGlobalNavigation
      }
      if (this.detectedSiteFromDeployment) {
        return this.detectedSiteFromDeployment
      }
      return null
    },
    preselectedProject () {
      if (this.preselectedSite && this.preselectedSite.projectName && this.preselectedSite.projectId) {
        return { id: this.preselectedSite.projectId, name: this.preselectedSite.projectName }
      }
      return null
    },
    isSelectedSiteMatchWithDetectedDeployment () {
      const getSiteId = site => site ? site.id : null
      const bothValuesExist = this.detectedSiteFromDeployment && this.selectedExistingSite
      const bothValuesHaveSameId = getSiteId(this.detectedSiteFromDeployment) === getSiteId(this.selectedExistingSite)
      return bothValuesExist && bothValuesHaveSameId
    },
    siteDropdownHelpText () {
      if (this.detectedSiteFromDeployment && this.selectedExistingSite) {
        if (this.isSelectedSiteMatchWithDetectedDeployment) {
          return 'Detected deployment from Arbimon Companion'
        }
        return `Site doesn't match with detected deployment from Arbimon Companion`
      }
      return null
    },
    shouldShowProjectSelector () {
      return !this.preselectedSite || (this.preselectedSite !== null && this.preselectedProject !== null)
    },
    shouldShowNameHelperMessage () {
      return this.selectedCoordinates && this.selectedCoordinates.length > 0 && (!this.form.selectedSiteName || this.form.selectedSiteName === '') && this.hasPassProjectValidation
    },
    shouldShowDetectedSiteWarning () {
      return this.detectedSiteFromDeployment && this.selectedExistingSite && !this.isSelectedSiteMatchWithDetectedDeployment
    },
    hasPassProjectValidation () {
      return !this.shouldShowProjectSelector || (this.shouldShowProjectSelector && this.selectedProject !== null)
    },
    hasPassedValidation () {
      return this.form.selectedSiteName && ((this.isCreatingNewSite && this.selectedCoordinates && this.selectedCoordinates.length > 1) || !this.isCreatingNewSite) && this.hasPassProjectValidation
    },
    selectedCoordinates () {
      if (typeof this.form.selectedLatitude !== 'number' || typeof this.form.selectedLongitude !== 'number') {
        return null
      }
      return [this.form.selectedLongitude, this.form.selectedLatitude]
    },
    actionButtonTitle () {
      return this.isCreatingNewSite ? 'Create' : 'Import'
    }
  },
  methods: {
    async extractDeviceInfoFromQuery () {
      let deviceInfo
      if (this.props.selectedFiles && this.props.selectedFiles.length > 0) {
        // try to get device info from the first wav file
        const firstWavFile = this.props.selectedFiles.find(file => {
          return fileHelper.getExtension(file.path) === 'wav' // read only wav file header info
        })
        deviceInfo = await this.$file.getDeviceInfo(firstWavFile)

        // try to get device info from the first directory
        if (!deviceInfo) {
          const firstFolder = this.props.selectedFiles.find(file => {
            return fileHelper.isFolder(file.path)
          })
          if (firstFolder) {
            deviceInfo = await this.$file.getDeviceInfoFromFolder(firstFolder.path)
          }
        }
      } else if (this.props.selectedFolderPath) {
        deviceInfo = await this.$file.getDeviceInfoFromFolder(this.props.selectedFolderPath)
      }
      return deviceInfo
    },
    async getDeploymentInfo (deploymentId) {
      if (!deploymentId) return null
      const idToken = await ipcRendererSend('getIdToken', `sendIdToken`)
      const response = await api.getDeploymentInfo(deploymentId, idToken)
      const stream = response.stream
      const id = response.id
      const deploymentType = response.deploymentType
      const deployedAt = response.deployedAt
      if (!stream || !id) return null // response doesn't have all required field
      return {stream, id, deploymentType, deployedAt}
    },
    async importFiles () {
      if (this.isCreatingNewSite) {
        await this.createSite()
      }
      // if site created successfully, it will be assigned to the selected existing site
      // then add file to site
      if (!this.selectedExistingSite) return
      let localSite = await ipcRendererSend('db.streams.get', `db.streams.get.${Date.now()}`, this.selectedExistingSite.id)
      if (!localSite) { // double check if the selected site already saved to local db
        localSite = await this.saveSiteInLocalDB(this.selectedExistingSite)
      } else {
        // selectedExistingSite can be data from server / local depends on which site the user chose
        // - if the user drag the file in, then selectedExistingSite will be the preselectedSite that user has chose from the previous page
        // - once the user choose any site from the dropdown list, then the selectedExistingSite will be site from the server.
        // to make sure the site information is up to date, then this chuck of code will always save newly fetched site info into local db

        // if there is serverCreatedAt value in selected existing site that means this data comes from local database
        // then, call fetch stream data from the server
        const isDataFromLocalDatabase = this.selectedExistingSite.serverCreatedAt
        if (isDataFromLocalDatabase) {
          try {
            const updatedSite = await streamService.fetchStream(this.selectedExistingSite.id) // fetch fresh stream data from server
            this.selectedExistingSite = updatedSite
          } catch (error) {
            console.error('error', error)
          }
        }
        // save site information from server into local db
        localSite = await streamService.updateStream(this.selectedExistingSite)
      }
      // use data from local database from now on
      this.selectedExistingSite = localSite
      const siteId = this.selectedExistingSite.id

      // setup deployment info
      const deploymentInfo = {
        deploymentId: this.props.deploymentId || '',
        deviceId: this.props.deviceId || '',
        timezone: this.props.deploymentConfiguredTimeZone
      }

      // pass files
      if (this.props.selectedFolderPath) {
        this.$file.handleDroppedFolder(this.props.selectedFolderPath, this.selectedExistingSite, deploymentInfo)
      }
      if (this.props.selectedFiles && this.props.selectedFiles.length > 0) {
        this.$file.handleDroppedFiles(this.props.selectedFiles, this.selectedExistingSite, deploymentInfo)
      }

      // set default timezone offset settings
      const timezoneOffsetObject = {}
      timezoneOffsetObject[siteId] = deploymentInfo.timezone
      await this.$store.dispatch('setAudiomothTimezoneOffsetConfigs', timezoneOffsetObject)

      // set default timezone settings
      const timezoneObject = {}
      if (this.props.recorderType === 'FRONTIER LABS') {
        timezoneObject[siteId] = FileTimezoneHelper.fileTimezone.USE_FILENAME
      } else if (this.props.recorderType === 'Song Meter' || this.props.recorderType === 'AudioMoth') {
        timezoneObject[siteId] = FileTimezoneHelper.fileTimezone.USE_DEVICE_CONFIG
      } else {
        timezoneObject[siteId] = FileTimezoneHelper.fileTimezone.LOCAL_TIME
      }
      await this.$store.dispatch('setSelectedTimezone', timezoneObject)

      // set selected stream id
      await this.$store.dispatch('setSelectedStreamId', siteId)
      this.$router.push('/')
    },
    async createSite () {
      if (this.isCreatingNewSite && !streamHelper.isValidName(this.form.selectedSiteName)) {
        this.errorMessage = streamHelper.getNameError(this.form.selectedSiteName)
        return
      }
      const idToken = await ipcRendererSend('getIdToken', `sendIdToken`)
      const name = this.form.selectedSiteName
      const latitude = this.form.selectedLatitude
      const longitude = this.form.selectedLongitude
      const projectId = this.selectedProject.id
      const isPublic = false
      const env = settings.get('settings.production_env')
      try {
        this.isLoading = true
        const id = await api.createStream(env, name, latitude, longitude, isPublic, projectId, idToken)
        this.selectedExistingSite = await this.saveSiteInLocalDB({
          id,
          name,
          latitude,
          longitude,
          isPublic: isPublic,
          project: this.selectedProject
        })
      } catch (error) {
        this.isLoading = false
        this.errorMessage = error === 'Unauthorized' ? 'You are not authorized.' : error
      }
    },
    async saveSiteInLocalDB (site) {
      const obj = streamHelper.parseSite(site)
      return ipcRendererSend('db.streams.create', `db.streams.create.${Date.now()}`, obj)
    },
    updateSelectedExistingSite (site) {
      console.info('[ImportToSitePage] updateSelectedExistingSite')
      this.selectedExistingSite = site
      if (site) {
        this.isCreatingNewSite = false
        this.form.selectedProjectName = this.selectedExistingSite.project
        this.form.selectedSiteName = this.selectedExistingSite.name
        this.form.selectedLatitude = this.selectedExistingSite.latitude
        this.form.selectedLongitude = this.selectedExistingSite.longitude
      } else {
        this.isCreatingNewSite = true
        this.form.selectedProjectName = ''
        this.form.selectedSiteName = ''
        this.form.selectedLatitude = null
        this.form.selectedLongitude = null
        this.$refs.siteSelector.resetSelectedSite()
      }
    },
    onUpdateLocation (coordinates) {
      console.info('onUpdateLocation', coordinates)
      this.form.selectedLongitude = coordinates[0]
      this.form.selectedLatitude = coordinates[1]
    },
    onSelectedSite (site) {
      // update site name in the form
      this.form.selectedSiteName = site.name

      // update location in the form, if needed (select existing site or on the first attempt to create new)
      const hasBeenChoosingExistingSiteBefore = this.isCreatingNewSite && this.selectedExistingSite !== null // create new site, after been choosing existing one
      if (!this.isCreatingNewSite || hasBeenChoosingExistingSiteBefore) {
        this.onUpdateLocation([site.longitude, site.latitude])
      }

      // update selecting existing site, if any
      this.selectedExistingSite = !this.isCreatingNewSite ? site : null
    },
    onSelectedProject (project) {
      this.selectedProject = project
      this.form.selectedProjectName = project && project.name ? project.name : ''
    }
  },
  watch: {
    selectedProject: {
      handler (val, previousVal) {
        if (val === previousVal) return
        const getProjectName = project => project ? project.name : null
        if (val === null || val === undefined) { // has reset project data
          this.updateSelectedExistingSite(null)
        } else if (!this.isCreatingNewSite && previousVal && getProjectName(previousVal) !== val.name) { // existing site that been selected is in different project
          this.updateSelectedExistingSite(null)
        }
      }
    }
  }
}
</script>

<style src="./ImportToSitePage.scss" scoped></style>
