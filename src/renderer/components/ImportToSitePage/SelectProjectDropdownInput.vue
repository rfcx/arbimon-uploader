<template>
  <DropDownWithSearchInput
    placeholder="Choose project"
    @onSearchInputFocus="onSearchInputFocus"
    @onClearSearchInput="onClearProjectNameSearchInput"
    @onOptionSelected="onSelectProject"
    :dropdownOptions="projectOptions"
    :text="selectedProjectName"
    :isDisabled="disabled"
    :isFetching="isLoading"
    :searchEnabled="false"
    :shouldShowEmptyContent="shouldShowErrorView"
  >
    <ErrorMessageView slot="emptyStateView" v-if="!isLoading">
      <span slot="message" v-if="hasNoProject"> 
        No project found.
        <a href="#" class="dropdown-sub-content__link" @click="redirectToArbimon()">Create project in Arbimon</a>
      </span>
      <span slot="message" v-else>
        {{ errorMessage }}
      </span>
      <a href="#" slot="refreshButton" class="dropdown-sub-content__link" @click.prevent="getProjectOptions()">
        <fa-icon class="iconRefresh" :icon="iconRefresh"></fa-icon>
      </a>
    </ErrorMessageView>
  </DropDownWithSearchInput>
</template>

<script>
import DropDownWithSearchInput from '../Common/Dropdown/DropdownWithSearchInput'
import ErrorMessageView from './ErrorMessageView'
import { faSync } from '@fortawesome/free-solid-svg-icons'
import api from '../../../../utils/api'
import settings from '../../services/settings'
import ipcRendererSend from '../../services/ipc'
export default {
  data () {
    return {
      iconRefresh: faSync,
      isLoading: false,
      selectedProject: this.initialProject,
      selectedProjectName: '',
      projectOptions: [],
      errorMessage: ''
    }
  },
  props: {
    initialProject: {
      type: Object,
      default: () => {
        return {}
      }
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  components: { DropDownWithSearchInput, ErrorMessageView },
  computed: {
    shouldShowErrorView () {
      return this.hasNoProject || this.errorMessage !== ''
    },
    hasNoProject () {
      return this.projectOptions.length === 0
    }
  },
  methods: {
    async getProjectOptions (keyword = null) {
      if (keyword) {
        let selectedProject = this.projectOptions.find(s => s.name === keyword)
        if (selectedProject) return
      }
      this.isLoading = true
      try {
        const idToken = await ipcRendererSend('getIdToken', `sendIdToken`)
        const projectOptions = await api.getUserProjects(idToken, keyword)
        this.setProjectOptions(projectOptions)
        this.isLoading = false
        this.errorMessage = ''
      } catch (error) {
        this.isLoading = false
        this.errorMessage = error
      }
    },
    setProjectOptions (options) {
      this.projectOptions = options.map(option => {
        const permissions = option.permissions || []
        const hasPermission = (name) => ['C', 'U'].includes(name.toUpperCase())
        const isReadOnly = permissions.length > 0 && !permissions.some(hasPermission)
        return {id: option.id, name: option.name, isReadOnly}
      })
    },
    async onSearchInputFocus () {
      await this.getProjectOptions()
    },
    onSelectProject (project) {
      this.selectedProject = project
      this.selectedProjectName = project && project.name ? project.name : ''
    },
    onClearProjectNameSearchInput () {
      this.selectedProject = null
      this.selectedProjectName = ''
    },
    redirectToArbimon () {
      const isProd = settings.get('settings.production_env')
      this.$electron.shell.openExternal(api.arbimonWebUrl(isProd))
    },
    updateSelectedProject (project) {
      if (project && project.name) this.selectedProjectName = project.name
      this.selectedProject = project
    }
  },
  created () {
    this.updateSelectedProject(this.initialProject)
  },
  watch: {
    initialProject () {
      this.updateSelectedProject(this.initialProject)
    },
    selectedProject: {
      handler: async function (value, prevValue) {
        this.$emit('onSelectedProjectNameChanged', value)
      }
    }
  }
}
</script>
