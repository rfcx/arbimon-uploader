<template>
  <div class="centered-block has-text-centered">
      <img :src="stateIcon" class="container__state-icon"><br>
      <span class="container__state-status">{{ stateStatus }}</span><br>
      <button class="button is-primary is-rounded container__button" @click="$emit('onSelectFolder')">Select Folder</button>
  </div>
</template>

<script>
const dropFileDefaultMessage = 'Use + Import Files button on the left or drop a folder of audio files here to start an uploading session.'
export default {
  props: {
    isDragging: Boolean,
    hasFileInQueued: {
      type: Boolean,
      default: false
    },
    isEmptyStream: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    stateStatus () {
      if (this.hasFileInQueued) {
        return 'Your audio is being uploaded.\n\nYou can still drop files here to upload more!'
      }
      return dropFileDefaultMessage
    },
    stateIcon () {
      if (this.isDragging) {
        return require('../../assets/ic-file-fill.svg')
      }
      if (this.hasFileInQueued) {
        return require('../../assets/ic-queuing.gif')
      }
      return require('../../assets/ic-file.svg')
    }
  }
}
</script>

<style lang="scss" scoped>
  .container {
    margin: 16px auto;
    padding: $default-padding;
    max-width: $wrapper-width;
    &__state-icon {
      width: 40px;
      height: 40px;
      margin-bottom: $default-padding-margin;
    }
    &__state-status {
      width: $full-width;
      white-space: pre-wrap;
      color: $secondary-text-color;
    }
    &__button {
      margin: $default-padding-margin auto;
      display: block;
    }
  }
</style>
