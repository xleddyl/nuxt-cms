<template>
   <div class="cms-scope cms-canvas" :data-theme="theme">
      <slot />
      <CmsToaster />
      <CmsConfirmModal />
   </div>
</template>

<script setup lang="ts">
import { useCmsTheme } from '../composables/cms-theme'
import { loadCmsSettings } from '../composables/cms-settings'

const theme = useCmsTheme()

await loadCmsSettings()
</script>
