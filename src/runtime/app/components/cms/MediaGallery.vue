<template>
   <CmsEmptyState
      v-if="notConfigured"
      icon="bolt"
      title="Media storage not configured"
      body="Set cms.media in nuxt.config to enable uploads."
   />

   <div v-else class="cms-media-gallery">
      <CmsInput v-model="search" icon="magnifying-glass" placeholder="Search media…" />

      <div v-if="showTypeFilters || folderChips.length || !readOnly" class="cms-media-filters">
         <template v-if="showTypeFilters">
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
         </template>
         <template v-if="folderChips.length">
            <span v-if="showTypeFilters" class="cms-media-filter-separator" />
            <span
               v-for="chip in folderChips"
               :key="chip.name"
               class="cms-pill-group"
               :class="{ 'is-active': folder === chip.name }"
            >
               <button
                  type="button"
                  class="cms-pill"
                  :class="{ 'is-active': folder === chip.name, 'is-empty': chip.empty }"
                  @click="folder = folder === chip.name ? null : chip.name"
               >
                  <CmsIcon name="folder" class="size-3" />{{ chip.name }}
               </button>
               <button
                  v-if="chip.empty && !readOnly"
                  type="button"
                  class="cms-pill-discard"
                  aria-label="Discard empty folder"
                  @click="discardFolder(chip.name)"
               >
                  <CmsIcon name="x-mark" class="size-3" />
               </button>
            </span>
         </template>
         <div v-if="!readOnly" class="cms-media-filters-actions">
            <CmsButton
               label="New folder"
               icon="folder-plus"
               variant="subtle"
               size="sm"
               @click="openNewFolder"
            />
            <CmsButton icon="plus" size="sm" aria-label="Upload media" @click="uploadOpen = true" />
         </div>
      </div>

      <CmsSpinner v-if="loading" />

      <div v-else-if="visible.length" class="cms-media-grid" :class="{ 'is-compact': selectable }">
         <component
            :is="selectable ? 'button' : 'div'"
            v-for="item in paged"
            :key="item.key"
            :type="selectable ? 'button' : undefined"
            :role="!selectable && !readOnly ? 'button' : undefined"
            :tabindex="!selectable && !readOnly ? 0 : undefined"
            class="cms-card cms-media-tile"
            :class="{ 'is-selectable': selectable || !readOnly }"
            @click="onTileClick(item)"
            @keydown.enter="!selectable && !readOnly && openEdit(item)"
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
               <div v-if="!selectable && !readOnly" class="cms-media-actions">
                  <CmsButton
                     icon="trash"
                     size="xs"
                     color="error"
                     variant="solid"
                     aria-label="Delete"
                     @click.stop="remove(item)"
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
               <div v-if="item.folder" class="cms-media-folder">
                  <CmsIcon name="folder" class="size-3" />{{ item.folder }}
               </div>
            </div>
         </component>
      </div>

      <CmsEmptyState v-else-if="loadError" icon="exclamation-triangle" title="Could not load media">
         <CmsButton label="Retry" icon="arrow-path" variant="subtle" @click="reload" />
      </CmsEmptyState>

      <CmsEmptyState
         v-else-if="items.length"
         icon="magnifying-glass"
         title="No matching media"
         body="Try a different search or filter."
      />

      <CmsEmptyState
         v-else
         icon="photo"
         :title="readOnly ? 'No media' : 'No media yet'"
         :body="readOnly ? 'No media registered.' : 'Files you upload will show up here.'"
      >
         <CmsButton
            v-if="!readOnly"
            label="Upload"
            icon="plus"
            variant="subtle"
            @click="uploadOpen = true"
         />
      </CmsEmptyState>

      <CmsPagination
         v-if="!loading && visible.length"
         v-model:page="page"
         :total="visible.length"
         :items-per-page="PAGE_SIZE"
      />

      <CmsModal v-if="!readOnly" v-model:open="uploadOpen" title="Upload media">
         <template #body>
            <div class="cms-form">
               <CmsFormField label="Destination folder">
                  <CmsMediaFolderPicker
                     v-model="uploadFolder"
                     :folders="folderNames"
                     @create="registerFolder"
                  />
               </CmsFormField>
               <CmsMediaUpload
                  :multiple="!selectable"
                  :media-type="mediaType"
                  :accept="accept"
                  :folder="uploadFolder"
                  @uploaded="onUploaded"
               />
            </div>
         </template>
      </CmsModal>

      <CmsModal v-if="!readOnly" v-model:open="newFolderOpen" title="New folder" size="sm">
         <template #body>
            <div class="cms-form">
               <CmsFormField label="Name">
                  <CmsInput
                     v-model="newFolderName"
                     autofocus
                     placeholder="e.g. blog/covers"
                     @keydown.enter.prevent="createFolder"
                  />
                  <p class="cms-form-hint">
                     {{
                        newFolderSlug
                           ? `Files uploaded here are stored under ${newFolderSlug}/`
                           : 'Letters, numbers and dashes. Use / for nesting.'
                     }}
                  </p>
               </CmsFormField>
               <div class="cms-actions is-end">
                  <CmsButton
                     label="Cancel"
                     variant="ghost"
                     color="neutral"
                     @click="newFolderOpen = false"
                  />
                  <CmsButton label="Create" :disabled="!newFolderSlug" @click="createFolder" />
               </div>
            </div>
         </template>
      </CmsModal>

      <CmsModal
         v-if="!readOnly"
         :open="!!editing"
         :title="editing ? mediaFilename(editing.key) : ''"
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
                  <CmsMediaFolderPicker
                     v-model="editFolder"
                     :folders="folderNames"
                     @create="registerFolder"
                  />
               </CmsFormField>
               <div class="cms-actions is-end">
                  <CmsButton
                     label="Cancel"
                     variant="ghost"
                     color="neutral"
                     @click="editing = null"
                  />
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
import { MEDIA_TYPES, mediaFilename, mediaIconFor, normalizeMediaFolder } from '#nuxt-cms'
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
const DRAFT_FOLDERS_KEY = 'nuxt-cms:media-folders'

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
const showTypeFilters = computed(() => !restricted.value && items.value.length > 0)

const search = ref('')

const draftFolders = ref<string[]>([])

onMounted(() => {
   try {
      const stored = JSON.parse(localStorage.getItem(DRAFT_FOLDERS_KEY) ?? '[]')
      if (Array.isArray(stored)) draftFolders.value = stored.filter((f) => typeof f === 'string')
   } catch {
      draftFolders.value = []
   }
})

function persistDraftFolders() {
   try {
      localStorage.setItem(DRAFT_FOLDERS_KEY, JSON.stringify(draftFolders.value))
   } catch {
      /* storage unavailable */
   }
}

const usedFolders = computed(() => {
   const set = new Set(items.value.map((item) => item.folder).filter((f): f is string => !!f))
   return [...set].sort()
})

const folderNames = computed(() =>
   [...new Set([...usedFolders.value, ...draftFolders.value])].sort()
)

const folderChips = computed(() =>
   folderNames.value.map((name) => ({ name, empty: !usedFolders.value.includes(name) }))
)

const folder = ref<string | null>(null)

function registerFolder(name: string) {
   if (!draftFolders.value.includes(name) && !usedFolders.value.includes(name)) {
      draftFolders.value = [...draftFolders.value, name]
      persistDraftFolders()
   }
}

function discardFolder(name: string) {
   draftFolders.value = draftFolders.value.filter((f) => f !== name)
   persistDraftFolders()
   if (folder.value === name) folder.value = null
}

watch(usedFolders, (used) => {
   const next = draftFolders.value.filter((f) => !used.includes(f))
   if (next.length !== draftFolders.value.length) {
      draftFolders.value = next
      persistDraftFolders()
   }
})

const visible = computed(() => {
   const active = restricted.value ?? (filter.value === 'all' ? null : filter.value)
   let list = active ? items.value.filter((item) => item.type === active) : items.value
   if (folder.value) list = list.filter((item) => item.folder === folder.value)
   const query = search.value.trim().toLowerCase()
   if (query) {
      list = list.filter((item) =>
         [item.key, item.alt, item.folder].some((value) => value?.toLowerCase().includes(query))
      )
   }
   return list
})

const PAGE_SIZE = 24
const page = ref(1)

watch([filter, folder, search], () => {
   page.value = 1
})

watch(visible, (list) => {
   const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
   if (page.value > pageCount) page.value = pageCount
})

const paged = computed(() =>
   visible.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

const uploadOpen = ref(false)
const uploadFolder = ref<string | null>(null)

watch(uploadOpen, (open) => {
   if (open) uploadFolder.value = folder.value
})

function onUploaded(uploaded: MediaItem[]) {
   uploadOpen.value = false
   if (props.selectable && uploaded[0]) {
      emit('select', uploaded[0])
      return
   }
   void reload()
}

const newFolderOpen = ref(false)
const newFolderName = ref('')
const newFolderSlug = computed(() => normalizeMediaFolder(newFolderName.value))

function openNewFolder() {
   newFolderName.value = ''
   newFolderOpen.value = true
}

function createFolder() {
   const name = newFolderSlug.value
   if (!name) return
   registerFolder(name)
   folder.value = name
   newFolderOpen.value = false
}

const editing = ref<MediaItem | null>(null)
const editAlt = ref('')
const editFolder = ref<string | null>(null)
const editSaving = ref(false)

function onTileClick(item: MediaItem) {
   if (props.selectable) {
      emit('select', { key: item.key, url: item.url })
      return
   }
   if (!readOnly.value) openEdit(item)
}

function openEdit(item: MediaItem) {
   editing.value = item
   editAlt.value = item.alt ?? ''
   editFolder.value = item.folder ?? null
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
            folder: editFolder.value,
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
