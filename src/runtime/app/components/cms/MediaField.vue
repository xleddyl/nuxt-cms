<template>
   <div v-if="model" class="cms-card cms-media-tile">
      <img v-if="kind === 'image' && url" :src="url" alt="" class="cms-media-preview-large" />
      <video
         v-else-if="kind === 'video' && url"
         :src="url"
         controls
         preload="metadata"
         playsinline
         class="cms-media-preview-large"
      />
      <div class="cms-media-bar">
         <CmsIcon :name="icon" class="cms-media-bar-icon size-4" />
         <span class="cms-media-bar-name" :title="model">{{ mediaFilename(model) }}</span>
         <CmsButton
            icon="photo"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Change"
            @click="openGallery"
         />
         <CmsButton
            icon="x-mark"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Remove"
            @click="clear"
         />
      </div>
   </div>

   <button v-else type="button" class="cms-dropzone is-dense" @click="openGallery">
      <CmsIcon name="photo" class="size-5 shrink-0" />
      <span class="text-sm font-medium">Choose from the gallery</span>
   </button>

   <CmsModal v-model:open="galleryOpen" title="Media" size="lg">
      <template #body>
         <CmsMediaGallery selectable :media-type="mediaType" :accept="accept" @select="onSelect" />
      </template>
   </CmsModal>
</template>

<script setup lang="ts">
import type { MediaType } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { mediaFilename, mediaIconFor, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsRuntime } from '../../composables/cms-runtime'

defineProps<{
   mediaType?: MediaType
   accept?: string[]
}>()

const model = defineModel<string | null>({ required: true })

const { mediaBaseUrl } = useCmsRuntime()

const galleryOpen = ref(false)

function onSelect(item: { key: string }) {
   model.value = item.key
   galleryOpen.value = false
}

function openGallery() {
   galleryOpen.value = true
}

function clear() {
   model.value = null
}

const url = computed(() => (model.value ? mediaPublicUrl(mediaBaseUrl, model.value) : null))
const kind = computed(() => (model.value ? mediaTypeForKey(model.value) : 'file'))
const icon = computed(() => mediaIconFor(kind.value))
</script>
