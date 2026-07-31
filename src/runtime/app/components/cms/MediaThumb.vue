<template>
   <span v-if="!value" class="cms-media-thumb-empty">—</span>

   <img
      v-else-if="kind === 'image' && url"
      :src="url"
      :alt="filename"
      :title="filename"
      loading="lazy"
      class="cms-media-thumb"
   />

   <video
      v-else-if="kind === 'video' && url"
      :src="url"
      :title="filename"
      muted
      playsinline
      preload="metadata"
      class="cms-media-thumb"
   />

   <span v-else :title="filename" class="cms-media-thumb is-fallback">
      <CmsIcon :name="icon" class="size-4" />
   </span>
</template>

<script setup lang="ts">
import { computed } from '#imports'
import { mediaFilename, mediaIconFor, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ value?: string | null }>()

const { mediaBaseUrl } = useCmsRuntime()

const kind = computed(() => (props.value ? mediaTypeForKey(props.value) : 'file'))
const url = computed(() => (props.value ? mediaPublicUrl(mediaBaseUrl, props.value) : null))
const filename = computed(() => (props.value ? mediaFilename(props.value) : ''))
const icon = computed(() => mediaIconFor(kind.value))
</script>
