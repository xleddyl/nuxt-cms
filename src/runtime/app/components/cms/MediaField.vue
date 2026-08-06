<template>
   <div v-if="model" class="cms-card cms-media-field">
      <div class="cms-media-field-preview">
         <img v-if="kind === 'image' && url" :src="url" alt="" />
         <video
            v-else-if="kind === 'video' && url"
            :src="url"
            controls
            preload="metadata"
            playsinline
         />
         <CmsIcon v-else :name="icon" class="size-10" />
      </div>
      <div class="cms-media-field-bar">
         <CmsIcon :name="icon" class="cms-media-bar-icon size-4" />
         <span class="cms-media-bar-name" :title="model">{{ mediaFilename(model) }}</span>
         <CmsButton
            label="Replace"
            icon="arrow-path"
            variant="subtle"
            color="neutral"
            size="xs"
            @click="openGallery"
         />
         <CmsButton
            label="Remove"
            icon="trash"
            variant="subtle"
            color="error"
            size="xs"
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
