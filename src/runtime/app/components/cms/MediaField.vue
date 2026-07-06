<template>
   <div v-if="model" class="cms-card overflow-hidden">
      <img
         v-if="kind === 'image' && url"
         :src="url"
         alt=""
         class="bg-(--cms-field) max-h-56 w-full object-cover"
      />
      <video
         v-else-if="kind === 'video' && url"
         :src="url"
         controls
         preload="metadata"
         playsinline
         class="bg-(--cms-field) max-h-56 w-full"
      />
      <div class="flex items-center gap-2.5 px-4 py-3">
         <UIcon :name="icon" class="text-(--ui-text-dimmed) size-4 shrink-0" />
         <span class="min-w-0 flex-1 truncate text-[13px] font-medium" :title="model">{{
            mediaFilename(model)
         }}</span>
         <UButton
            icon="i-lucide-images"
            variant="ghost"
            color="neutral"
            size="xs"
            class="rounded-full"
            :aria-label="t('cms.form.mediaChange')"
            @click="openGallery"
         />
         <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            class="rounded-full"
            :aria-label="t('cms.form.mediaRemove')"
            @click="clear"
         />
      </div>
   </div>

   <button v-else type="button" class="cms-dropzone is-dense" @click="openGallery">
      <UIcon name="i-lucide-images" class="size-5 shrink-0" />
      <span class="text-[13px] font-medium">{{ t('cms.form.mediaChoose') }}</span>
   </button>

   <UModal v-model:open="galleryOpen" :title="t('cms.media.title')" :ui="CMS_MODAL_UI">
      <template #body>
         <CmsMediaGallery selectable :media-type="mediaType" :accept="accept" @select="onSelect" />
      </template>
   </UModal>
</template>

<script setup lang="ts">
import type { MediaType } from '#nuxt-cms'
import { computed, ref, useI18n } from '#imports'
import { mediaFilename, mediaIconFor, mediaPublicUrl, mediaTypeForKey } from '#nuxt-cms'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { CMS_MODAL_UI } from '../../utils/ui'

defineProps<{
   mediaType?: MediaType
   accept?: string[]
}>()

const model = defineModel<string | null>({ required: true })

const { t } = useI18n()
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
