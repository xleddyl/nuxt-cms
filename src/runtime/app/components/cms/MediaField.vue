<template>
   <div v-if="model" class="cms-card cms-block-tile cms-media-single">
      <button
         type="button"
         class="cms-block-preview"
         aria-label="Replace media"
         @click="openGallery"
      >
         <img v-if="kind === 'image' && url" :src="url" alt="" loading="lazy" />
         <video
            v-else-if="kind === 'video' && url"
            :src="url"
            preload="metadata"
            muted
            playsinline
         />
         <CmsIcon v-else :name="icon" class="size-7" />
      </button>
      <div class="cms-block-bar">
         <span class="cms-block-bar-name" :title="model">{{ mediaFilename(model) }}</span>
         <div class="cms-block-bar-actions">
            <CmsButton
               icon="arrow-path"
               size="xs"
               variant="ghost"
               color="neutral"
               aria-label="Replace"
               @click="openGallery"
            />
            <CmsButton
               icon="trash"
               size="xs"
               variant="ghost"
               color="error"
               aria-label="Remove"
               @click="clear"
            />
         </div>
      </div>
   </div>

   <button v-else type="button" class="cms-block-add cms-media-single" @click="openGallery">
      <CmsIcon name="photo" class="size-5" />
      <span>Choose</span>
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
   mediaType?: MediaType | MediaType[]
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
