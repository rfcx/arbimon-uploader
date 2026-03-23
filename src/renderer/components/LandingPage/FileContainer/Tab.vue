<template>
  <div class="file-tab__wrapper">
    <div class="tabs is-fullwidth">
      <ul>
        <li
          v-for="tab in tabGroups"
          :key="tab.id"
          :class="{ 'is-active': selectedTab ? tab.id === selectedTab : tab.id === 'Prepared' }"
          @click="selectTab(tab.id)"
        >
          <a>
            <img class="file-tab__fail-icon" :src="require(`../../../assets/ic-state-failed.svg`)" v-if="hasFailedFiles(tab.id)" />
            <span>{{tab.name}} ({{getNumberOfFiles(tab.id)}})</span>
          </a>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  data () {
    return {
      tabGroups: [
        {id: 'Prepared', name: 'Preparing'},
        {id: 'Queued', name: 'Queued'},
        {id: 'Completed', name: 'Uploaded'}
      ]
    }
  },
  props: {
    preparingGroup: Object,
    queuedGroup: Object,
    completedGroup: Object,
    selectedTab: String
  },
  computed: {
    ...mapState({
      selectedStreamId: (state) => state.AppSetting.selectedStreamId
    })
  },
  methods: {
    getNumberOfFiles (tab) {
      switch (tab) {
        case 'Prepared': return this.preparingGroup.numberOfFiles
        case 'Queued': return this.queuedGroup.numberOfFiles
        case 'Completed': return this.completedGroup.numberOfFiles
      }
    },
    hasFailedFiles (tab) {
      switch (tab) {
        case 'Prepared': return this.preparingGroup.hasErrorFiles
        case 'Queued': return this.queuedGroup.hasErrorFiles
        case 'Completed': return this.completedGroup.hasErrorFiles
      }
    },
    selectTab (tab) {
      this.$emit('onSelectTab', tab)

      if (!this.selectedStreamId) {
        return
      }

      const tabObject = {}
      tabObject[this.selectedStreamId] = tab
      this.$store.dispatch('setSelectedTab', tabObject)
    }
  }
}
</script>

<style lang="scss" scoped>
  .file-tab {
    &__wrapper {
      padding-bottom: $default-padding-margin;
    }
    &__fail-icon {
      padding-right: $default-padding-margin;
    }
  }
  .tabs {
    ul {
      margin-left: 0px !important;
    }
    .is-active {
      font-weight: $title-font-weight;
    }
  }
</style>
