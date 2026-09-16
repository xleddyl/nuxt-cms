<template>
   <CmsEmptyState
      v-if="notConfigured"
      icon="bolt"
      title="Media storage not configured"
      body="Set cms.media in nuxt.config to enable uploads."
   />

   <div v-else class="cms-media-gallery">
      <CmsInput v-model="search" icon="magnifying-glass" placeholder="Search media…" />

      <p v-if="sourceHint" class="cms-media-source">{{ sourceHint }}</p>

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
                  <span v-if="chip.count" class="cms-pill-count">{{ chip.count }}</span>
               </button>
               <button
                  v-if="!readOnly"
                  type="button"
                  class="cms-pill-discard"
                  :aria-label="`Delete folder ${chip.name}`"
                  @click="deleteFolder(chip.name)"
               >
                  <CmsIcon name="x-mark" class="size-3" />
               </button>
            </span>
         </template>
         <div v-if="!readOnly" class="cms-media-filters-actions">
            <CmsButton
               label="New folder"
               icon="folder-plus"
               variant="soft"
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
            :role="!selectable && canEditAlt ? 'button' : undefined"
            :tabindex="!selectable && canEditAlt ? 0 : undefined"
            class="cms-card cms-media-tile"
            :class="{ 'is-selectable': selectable || canEditAlt }"
            @click="onTileClick(item)"
            @keydown.enter="!selectable && canEditAlt && openEdit(item)"
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
         <CmsButton label="Retry" icon="arrow-path" variant="soft" @click="reload" />
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
            variant="soft"
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
                     @create="onFolderCreate"
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
         v-if="canEditAlt"
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
               <CmsFormField v-if="canUpload" label="Folder">
                  <CmsMediaFolderPicker
                     v-model="editFolder"
                     :folders="folderNames"
                     @create="onFolderCreate"
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
import type { MediaItem, MediaSourceInfo, MediaType } from '#nuxt-cms'
import { computed, onMounted, ref, watch } from '#imports'
import {
   MEDIA_TYPES,
   mediaFilename,
   mediaIconFor,
   mediaTypeFilter,
   normalizeMediaFolder,
} from '#nuxt-cms'
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
   mediaType?: MediaType | MediaType[]
   accept?: string[]
}>()

const emit = defineEmits<{ select: [item: { key: string; url: string | null }] }>()

const toast = useCmsToast()
const runtime = useCmsRuntime()
const isLocal = computed(() => runtime.mediaStorage === 'local')
const canUpload = computed(() => !isLocal.value)
const canEditAlt = computed(() => true)
const readOnly = computed(() => !canUpload.value)

const endpoint = '/api/cms/admin/media'
const items = ref<MediaItem[]>([])
const serverFolders = ref<string[]>([])
const source = ref<MediaSourceInfo | null>(null)
const loading = ref(true)
const errorCode = ref<number | null>(null)

async function reload() {
   loading.value = true
   errorCode.value = null
   try {
      const result = await $fetch<{
         items: MediaItem[]
         folders?: string[]
         source: MediaSourceInfo
      }>(endpoint)
      items.value = result.items
      serverFolders.value = result.folders ?? []
      source.value = result.source
   } catch (err) {
      errorCode.value = (err as { statusCode?: number }).statusCode ?? 500
   } finally {
      loading.value = false
   }
}

const sourceHint = computed(() => {
   if (!isLocal.value || !source.value) return null
   const { kind, root, builtAt } = source.value
   if (kind === 'filesystem') return `read live from ${root}`
   if (kind === 'manifest') {
      const when = builtAt ? new Date(builtAt).toLocaleString() : 'the last build'
      return `from the build of ${when} — add files to ${root} and redeploy to update`
   }
   return `no media folder was found at build time — check cms.media.publicBaseUrl`
})
onMounted(reload)

const notConfigured = computed(() => errorCode.value === 501)
const loadError = computed(() => errorCode.value !== null && errorCode.value !== 501)

const allowedTypes = computed(() => mediaTypeFilter(props.mediaType))
const filters = computed<('all' | MediaType)[]>(() => [
   'all',
   ...(allowedTypes.value ?? MEDIA_TYPES),
])
const filter = ref<'all' | MediaType>('all')
const showTypeFilters = computed(() => filters.value.length > 2 && items.value.length > 0)

watch(filters, (list) => {
   if (!list.includes(filter.value)) filter.value = 'all'
})

const search = ref('')

const usedFolders = computed(() => {
   const set = new Set(items.value.map((item) => item.folder).filter((f): f is string => !!f))
   return [...set].sort()
})

const folderNames = computed(() =>
   [...new Set([...serverFolders.value, ...usedFolders.value])].sort()
)

const folderCounts = computed(() => {
   const counts = new Map<string, number>()
   for (const item of items.value) {
      if (!item.folder) continue
      counts.set(item.folder, (counts.get(item.folder) ?? 0) + 1)
   }
   return counts
})

const folderChips = computed(() =>
   folderNames.value.map((name) => ({
      name,
      count: folderCounts.value.get(name) ?? 0,
      empty: !folderCounts.value.get(name),
   }))
)

const folder = ref<string | null>(null)

function onFolderCreate(name: string) {
   registerFolder(name).catch((err) =>
      toast.add({
         title: 'Could not create the folder',
         description: errorMessage(err),
         color: 'error',
      })
   )
}

async function registerFolder(name: string) {
   if (folderNames.value.includes(name)) return
   await $fetch(`${endpoint}/folders`, { method: 'POST', body: { name } })
   await reload()
}

async function deleteFolder(name: string) {
   const count = folderCounts.value.get(name) ?? 0
   const question = count
      ? `Delete the folder "${name}" and its ${count} file${count > 1 ? 's' : ''}?`
      : `Delete the empty folder "${name}"?`
   if (!(await confirmAction(question))) return
   try {
      await $fetch(`${endpoint}/folders`, {
         method: 'DELETE',
         query: { name, recursive: count ? 'true' : 'false' },
      })
      if (folder.value === name) folder.value = null
      await reload()
   } catch (error) {
      toast.add({ title: 'Delete failed', description: errorMessage(error), color: 'error' })
   }
}

const visible = computed(() => {
   const allowed = allowedTypes.value
   let list = allowed ? items.value.filter((item) => allowed.includes(item.type)) : items.value
   if (filter.value !== 'all') list = list.filter((item) => item.type === filter.value)
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

const creatingFolder = ref(false)

async function createFolder() {
   const name = newFolderSlug.value
   if (!name || creatingFolder.value) return
   creatingFolder.value = true
   try {
      await registerFolder(name)
      folder.value = name
      newFolderOpen.value = false
   } catch (err) {
      toast.add({
         title: 'Could not create the folder',
         description: errorMessage(err),
         color: 'error',
      })
   } finally {
      creatingFolder.value = false
   }
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
   if (canEditAlt.value) openEdit(item)
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
            key: editing.value.key,
            alt: editAlt.value.trim() || null,
            ...(canUpload.value ? { folder: editFolder.value } : {}),
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
