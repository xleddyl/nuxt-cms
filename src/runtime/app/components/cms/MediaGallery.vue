<template>
   <CmsEmptyState
      v-if="notConfigured"
      icon="bolt"
      title="Media storage not configured"
      body="Set cms.media in nuxt.config to enable uploads."
   />

   <div v-else class="cms-media-gallery">
      <CmsMediaUpload
         v-if="!readOnly"
         :multiple="!selectable"
         :dense="selectable"
         :media-type="mediaType"
         :accept="accept"
         @uploaded="onUploaded"
      />

      <div v-if="!restricted && items.length" class="cms-media-filters">
         <button
            v-for="f in filters"
            :key="f"
            type="button"
            class="cms-pill"
            :class="{ 'is-active': filter === f }"
            @click="filter = f"
         >
            {{ filterLabels[f] }}
         </button>
         <template v-if="folders.length">
            <span class="cms-media-filter-separator" />
            <button
               v-for="f in folders"
               :key="f"
               type="button"
               class="cms-pill"
               :class="{ 'is-active': folder === f }"
               @click="folder = folder === f ? null : f"
            >
               <CmsIcon name="folder" class="size-3" />{{ f }}
            </button>
         </template>
      </div>

      <CmsSpinner v-if="loading" />

      <div v-else-if="visible.length" class="cms-media-grid" :class="{ 'is-compact': selectable }">
         <component
            :is="selectable ? 'button' : 'div'"
            v-for="item in paged"
            :key="item.key"
            :type="selectable ? 'button' : undefined"
            class="cms-card cms-media-tile"
            :class="{ 'is-selectable': selectable }"
            @click="selectable && emit('select', { key: item.key, url: item.url })"
         >
            <div class="cms-media-preview">
               <img
                  v-if="item.type === 'image' && item.url"
                  :src="item.url"
                  alt=""
                  loading="lazy"
               />
               <video
                  v-else-if="item.type === 'video' && item.url"
                  :src="item.url"
                  preload="metadata"
                  muted
                  playsinline
               />
               <CmsIcon v-else :name="mediaIconFor(item.type)" class="size-8" />
               <div v-if="!selectable" class="cms-media-actions">
                  <CmsButton
                     v-if="!readOnly"
                     icon="pencil-square"
                     size="xs"
                     color="neutral"
                     variant="solid"
                     aria-label="Edit details"
                     @click="openEdit(item)"
                  />
                  <CmsButton
                     v-if="!readOnly"
                     icon="trash"
                     size="xs"
                     color="error"
                     variant="solid"
                     aria-label="Delete"
                     @click="remove(item)"
                  />
               </div>
               <div class="cms-media-info">
                  {{ extension(item.key) }} · {{ formatSize(item.size)
                  }}<template v-if="item.width && item.height">
                     · {{ item.width }}×{{ item.height }}
                  </template>
               </div>
            </div>
            <div class="cms-media-meta">
               <div class="cms-media-name" :title="item.key">
                  {{ mediaFilename(item.key) }}
               </div>
            </div>
         </component>
      </div>

      <CmsEmptyState v-else-if="loadError" icon="exclamation-triangle" title="Could not load media">
         <CmsButton label="Retry" icon="arrow-path" variant="subtle" @click="reload" />
      </CmsEmptyState>

      <CmsEmptyState
         v-else
         icon="photo"
         :title="readOnly ? 'No media' : 'No media yet'"
         :body="readOnly ? 'No media registered.' : 'Files you upload will show up here.'"
      />

      <CmsPagination
         v-if="!loading && visible.length"
         v-model:page="page"
         :total="visible.length"
         :items-per-page="PAGE_SIZE"
      />

      <CmsModal
         v-if="!readOnly"
         :open="!!editing"
         :title="editing ? mediaFilename(editing.key) : ''"
         size="lg"
         @update:open="
            (open: boolean) => {
               if (!open) editing = null
            }
         "
      >
         <template #body>
            <div class="cms-form">
               <CmsFormField label="Alt text">
                  <CmsInput v-model="editAlt" />
               </CmsFormField>
               <CmsFormField label="Folder">
                  <CmsInput v-model="editFolder" />
               </CmsFormField>
               <div class="cms-actions is-end">
                  <CmsButton label="Save" :loading="editSaving" @click="saveEdit" />
               </div>
            </div>
         </template>
      </CmsModal>
   </div>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { computed, onMounted, ref, watch } from '#imports'
import { MEDIA_TYPES, mediaFilename, mediaIconFor } from '#nuxt-cms'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'
import { errorMessage } from '../../utils/ui'

const filterLabels: Record<string, string> = {
   all: 'All',
   image: 'Images',
   video: 'Videos',
   file: 'Files',
}

const props = defineProps<{
   selectable?: boolean
   mediaType?: MediaType
   accept?: string[]
}>()

const emit = defineEmits<{ select: [item: { key: string; url: string | null }] }>()

const toast = useCmsToast()
const runtime = useCmsRuntime()
const readOnly = computed(() => runtime.mediaStorage === 'local')

const endpoint = '/api/cms/admin/media'

const items = ref<MediaItem[]>([])
const loading = ref(true)
const errorCode = ref<number | null>(null)

async function reload() {
   loading.value = true
   errorCode.value = null
   try {
      const result = await $fetch<{ items: MediaItem[] }>(endpoint)
      items.value = result.items
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

const PAGE_SIZE = 24
const page = ref(1)

watch([filter, folder], () => {
   page.value = 1
})

watch(visible, (list) => {
   const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
   if (page.value > pageCount) page.value = pageCount
})

const paged = computed(() =>
   visible.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

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
         title: 'Save failed',
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

const confirmAction = useCmsConfirm()
const removing = ref(false)

async function remove(item: MediaItem) {
   if (removing.value) return
   if (!(await confirmAction('Delete this file? Entries referencing it will keep a broken link.')))
      return
   removing.value = true
   try {
      await $fetch(endpoint, { method: 'DELETE', query: { key: item.key } })
      await reload()
   } catch (err) {
      toast.add({
         title: 'Delete failed',
         description: errorMessage(err),
         color: 'error',
      })
   } finally {
      removing.value = false
   }
}
</script>
