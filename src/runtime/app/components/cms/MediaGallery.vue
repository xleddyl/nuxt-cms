<template>
   <CmsEmptyState
      v-if="notConfigured"
      icon="i-lucide-plug-zap"
      :title="t('cms.media.notConfiguredTitle')"
      :body="t('cms.media.notConfiguredBody')"
   />

   <div v-else class="flex flex-col gap-5">
      <CmsMediaUpload
         :multiple="!selectable"
         :dense="selectable"
         :media-type="mediaType"
         :accept="accept"
         @uploaded="onUploaded"
      />

      <div v-if="!restricted && items.length" class="flex flex-wrap items-center gap-1">
         <button
            v-for="f in filters"
            :key="f"
            type="button"
            class="cms-pill"
            :class="{ 'is-active': filter === f }"
            @click="filter = f"
         >
            {{ t(`cms.media.filter.${f}`) }}
         </button>
         <template v-if="folders.length">
            <span class="bg-(--cms-line) mx-1 h-4 w-px" />
            <button
               v-for="f in folders"
               :key="f"
               type="button"
               class="cms-pill"
               :class="{ 'is-active': folder === f }"
               @click="folder = folder === f ? null : f"
            >
               <UIcon name="i-lucide-folder" class="mr-1 size-3" />{{ f }}
            </button>
         </template>
      </div>

      <div v-if="loading" class="flex justify-center py-10">
         <UIcon name="i-lucide-loader-circle" class="text-(--ui-text-dimmed) size-6 animate-spin" />
      </div>

      <div
         v-else-if="visible.length"
         class="grid gap-4"
         :class="
            selectable ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
         "
      >
         <component
            :is="selectable ? 'button' : 'div'"
            v-for="item in visible"
            :key="item.key"
            :type="selectable ? 'button' : undefined"
            class="cms-card group overflow-hidden text-left"
            :class="{
               'hover:border-(--cms-fern) hover:shadow-md': selectable,
            }"
            @click="selectable && emit('select', { key: item.key, url: item.url })"
         >
            <div class="bg-(--cms-field) relative flex aspect-square items-center justify-center">
               <img
                  v-if="item.type === 'image' && item.url"
                  :src="item.url"
                  alt=""
                  loading="lazy"
                  class="absolute inset-0 size-full object-cover"
               />
               <video
                  v-else-if="item.type === 'video' && item.url"
                  :src="item.url"
                  preload="metadata"
                  muted
                  playsinline
                  class="absolute inset-0 size-full object-cover"
               />
               <UIcon
                  v-else
                  :name="mediaIconFor(item.type)"
                  class="text-(--ui-text-dimmed) size-8"
               />
               <div
                  v-if="!selectable"
                  class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
               >
                  <UButton
                     icon="i-lucide-pencil"
                     size="xs"
                     color="neutral"
                     variant="solid"
                     class="rounded-full shadow-sm"
                     :aria-label="t('cms.media.edit')"
                     @click="openEdit(item)"
                  />
                  <UButton
                     icon="i-lucide-copy"
                     size="xs"
                     color="neutral"
                     variant="solid"
                     class="rounded-full shadow-sm"
                     :aria-label="t('cms.media.copy')"
                     @click="copy(item)"
                  />
                  <UButton
                     icon="i-lucide-trash-2"
                     size="xs"
                     color="error"
                     variant="solid"
                     class="rounded-full shadow-sm"
                     :aria-label="t('cms.media.delete')"
                     @click="remove(item)"
                  />
               </div>
            </div>
            <div class="flex flex-col gap-1 px-3.5 py-2.5">
               <div class="truncate text-[13px] font-medium" :title="item.key">
                  {{ mediaFilename(item.key) }}
               </div>
               <div class="cms-kicker">
                  {{ extension(item.key) }} · {{ formatSize(item.size)
                  }}<template v-if="item.width && item.height">
                     · {{ item.width }}×{{ item.height }}
                  </template>
               </div>
            </div>
         </component>
      </div>

      <CmsEmptyState
         v-else-if="loadError"
         icon="i-lucide-triangle-alert"
         :title="t('cms.media.loadError')"
      >
         <UButton
            :label="t('cms.media.retry')"
            icon="i-lucide-refresh-cw"
            variant="subtle"
            class="mt-3 rounded-full px-4"
            @click="reload"
         />
      </CmsEmptyState>

      <CmsEmptyState
         v-else
         icon="i-lucide-image"
         :title="t('cms.media.emptyTitle')"
         :body="t('cms.media.emptyBody')"
      />

      <UModal
         :open="!!editing"
         :title="editing ? mediaFilename(editing.key) : ''"
         :ui="CMS_MODAL_UI"
         @update:open="
            (open: boolean) => {
               if (!open) editing = null
            }
         "
      >
         <template #body>
            <div class="flex flex-col gap-4">
               <UFormField :label="t('cms.media.alt')">
                  <UInput v-model="editAlt" size="lg" class="w-full" />
               </UFormField>
               <UFormField :label="t('cms.media.folder')">
                  <UInput v-model="editFolder" size="lg" class="w-full" />
               </UFormField>
               <div class="flex justify-end">
                  <UButton
                     :label="t('cms.form.save')"
                     :loading="editSaving"
                     class="rounded-full px-6"
                     @click="saveEdit"
                  />
               </div>
            </div>
         </template>
      </UModal>
   </div>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { computed, onMounted, ref, useI18n, useToast } from '#imports'
import { MEDIA_TYPES, mediaFilename, mediaIconFor } from '#nuxt-cms'
import { CMS_MODAL_UI, errorMessage } from '../../utils/ui'

const props = defineProps<{
   selectable?: boolean
   mediaType?: MediaType
   accept?: string[]
}>()

const emit = defineEmits<{ select: [item: { key: string; url: string | null }] }>()

const { t } = useI18n()
const toast = useToast()

const endpoint = '/api/cms/admin/media'

const items = ref<MediaItem[]>([])
const loading = ref(true)
const errorCode = ref<number | null>(null)

async function reload() {
   loading.value = true
   errorCode.value = null
   try {
      const page = await $fetch<{ items: MediaItem[] }>(endpoint)
      items.value = page.items
   } catch (err) {
      errorCode.value = (err as { statusCode?: number }).statusCode ?? 500
   } finally {
      loading.value = false
   }
}
onMounted(reload)

const notConfigured = computed(() => errorCode.value === 501)
const loadError = computed(() => errorCode.value !== null && errorCode.value !== 501)

const restricted = computed(() =>
   props.mediaType && props.mediaType !== 'file' ? props.mediaType : null
)
const filters = ['all', ...MEDIA_TYPES] as const
const filter = ref<(typeof filters)[number]>('all')

const folders = computed(() => {
   const set = new Set(items.value.map((item) => item.folder).filter((f): f is string => !!f))
   return [...set].sort()
})
const folder = ref<string | null>(null)

const visible = computed(() => {
   const active = restricted.value ?? (filter.value === 'all' ? null : filter.value)
   let list = active ? items.value.filter((item) => item.type === active) : items.value
   if (folder.value) list = list.filter((item) => item.folder === folder.value)
   return list
})

function onUploaded(uploaded: MediaItem[]) {
   if (props.selectable && uploaded[0]) {
      emit('select', uploaded[0])
      return
   }
   void reload()
}

const editing = ref<MediaItem | null>(null)
const editAlt = ref('')
const editFolder = ref('')
const editSaving = ref(false)

function openEdit(item: MediaItem) {
   editing.value = item
   editAlt.value = item.alt ?? ''
   editFolder.value = item.folder ?? ''
}

async function saveEdit() {
   if (!editing.value) return
   editSaving.value = true
   try {
      await $fetch(endpoint, {
         method: 'PUT',
         body: {
            id: editing.value.id,
            alt: editAlt.value.trim() || null,
            folder: editFolder.value.trim() || null,
         },
      })
      editing.value = null
      await reload()
   } catch (err) {
      toast.add({
         title: t('cms.toast.saveFailed'),
         description: errorMessage(err),
         color: 'error',
      })
   } finally {
      editSaving.value = false
   }
}

function extension(key: string) {
   const dot = key.lastIndexOf('.')
   return dot === -1 ? 'file' : key.slice(dot + 1).toLowerCase()
}

function formatSize(bytes: number | null) {
   if (bytes == null) return '—'
   if (bytes < 1024) return `${bytes} B`
   let value = bytes
   for (const unit of ['KB', 'MB', 'GB']) {
      value /= 1024
      if (value < 1024) return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`
   }
   return `${Math.round(value / 1024)} TB`
}

async function copy(item: MediaItem) {
   try {
      await navigator.clipboard.writeText(item.url ?? item.key)
      toast.add({ title: t('cms.media.copied'), color: 'success' })
   } catch {
      toast.add({ title: t('cms.media.copyError'), color: 'error' })
   }
}

async function remove(item: MediaItem) {
   if (!confirm(t('cms.media.deleteConfirm'))) return
   try {
      await $fetch(endpoint, { method: 'DELETE', query: { key: item.key } })
      await reload()
   } catch (err) {
      toast.add({
         title: t('cms.media.deleteFailed'),
         description: errorMessage(err),
         color: 'error',
      })
   }
}
</script>
