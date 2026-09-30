<template>
   <CmsEmptyState
      v-if="notConfigured"
      icon="bolt"
      title="Media storage not configured"
      body="Set cms.media in nuxt.config to enable uploads."
   />

   <div
      v-else
      class="cms-media-gallery"
      :class="{ 'is-compact': selectable }"
      @dragenter="onGalleryDragEnter"
      @dragover="onGalleryDragOver"
      @dragleave="onGalleryDragLeave"
      @drop="onGalleryDrop"
   >
      <div class="cms-media-toolbar">
         <CmsInput
            v-model="search"
            icon="magnifying-glass"
            :placeholder="
               folder && !searchEverywhere
                  ? `Search in ${mediaFolderName(folder)}…`
                  : 'Search media…'
            "
            class="cms-media-search"
         >
            <template v-if="search" #trailing>
               <button
                  type="button"
                  class="cms-media-search-clear"
                  aria-label="Clear search"
                  @click="search = ''"
               >
                  <CmsIcon name="x-mark" class="size-4" />
               </button>
            </template>
         </CmsInput>
         <div class="cms-media-toolbar-actions">
            <CmsDropdownMenu :items="sortItems" :content="{ align: 'end' }">
               <CmsButton
                  :label="sortLabels[activeSort]"
                  icon="arrows-up-down"
                  variant="ghost"
                  color="neutral"
                  size="sm"
               />
            </CmsDropdownMenu>
            <div class="cms-media-view-toggle" role="group" aria-label="View">
               <CmsButton
                  icon="squares-2x2"
                  size="sm"
                  :variant="view === 'grid' ? 'soft' : 'ghost'"
                  color="neutral"
                  aria-label="Grid view"
                  @click="view = 'grid'"
               />
               <CmsButton
                  icon="list-bullet"
                  size="sm"
                  :variant="view === 'list' ? 'soft' : 'ghost'"
                  color="neutral"
                  aria-label="List view"
                  @click="view = 'list'"
               />
            </div>
            <template v-if="canUpload">
               <CmsButton
                  label="New folder"
                  icon="folder-plus"
                  variant="soft"
                  size="sm"
                  :disabled="!canNest"
                  @click="openNewFolder"
               />
               <CmsButton
                  label="Upload"
                  icon="cloud-arrow-up"
                  size="sm"
                  @click="uploadOpen = true"
               />
            </template>
         </div>
      </div>

      <p v-if="sourceHint" class="cms-media-source">{{ sourceHint }}</p>

      <div class="cms-media-nav">
         <nav class="cms-media-crumbs" aria-label="Folder">
            <template v-for="(crumb, index) in crumbs" :key="crumb.folder ?? ''">
               <CmsIcon v-if="index" name="chevron-right" class="cms-breadcrumb-separator size-3" />
               <button
                  type="button"
                  class="cms-media-crumb"
                  :class="{
                     'is-current': crumb.folder === folder,
                     'is-drop': dropTarget === targetId(crumb.folder),
                  }"
                  :aria-current="crumb.folder === folder ? 'page' : undefined"
                  @click="openFolder(crumb.folder)"
                  @dragover="onTargetDragOver($event, crumb.folder)"
                  @dragleave="onTargetDragLeave(crumb.folder)"
                  @drop="onTargetDrop($event, crumb.folder)"
               >
                  <CmsIcon v-if="!crumb.folder" name="home" class="size-3.5" />
                  {{ crumb.label }}
               </button>
            </template>
         </nav>
         <div v-if="folder && canManage" class="cms-media-folder-actions">
            <CmsButton
               label="Rename"
               icon="pencil-square"
               variant="ghost"
               color="neutral"
               size="xs"
               @click="openRename"
            />
            <CmsButton
               label="Delete folder"
               icon="trash"
               variant="ghost"
               color="error"
               size="xs"
               @click="removeFolder(folder)"
            />
         </div>
      </div>

      <div v-if="uploader.uploading.value" class="cms-media-progress">
         <CmsIcon name="arrow-path" class="size-4 animate-spin" />
         Uploading {{ Math.min(uploader.done.value + 1, uploader.total.value) }} of
         {{ uploader.total.value }} to {{ folder ?? 'Library root' }}…
      </div>

      <div v-if="selection.length" class="cms-media-selection">
         <span class="cms-media-selection-count">{{ selection.length }} selected</span>
         <CmsButton
            v-if="selection.length < visibleFiles.length"
            :label="`Select all ${visibleFiles.length}`"
            variant="ghost"
            color="neutral"
            size="xs"
            @click="selectAll"
         />
         <div class="cms-media-selection-actions">
            <CmsButton
               label="Move to…"
               icon="folder-arrow-down"
               variant="soft"
               size="xs"
               @click="openMove"
            />
            <CmsButton
               label="Delete"
               icon="trash"
               variant="soft"
               color="error"
               size="xs"
               @click="removeItems(selectedItems)"
            />
            <CmsButton
               icon="x-mark"
               variant="ghost"
               color="neutral"
               size="xs"
               aria-label="Clear selection"
               @click="clearSelection"
            />
         </div>
      </div>

      <div v-else-if="showTypeFilters || (query && folder)" class="cms-media-filters">
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
         <button
            v-if="query && folder"
            type="button"
            class="cms-pill cms-media-scope"
            :class="{ 'is-active': searchEverywhere }"
            @click="searchEverywhere = !searchEverywhere"
         >
            <CmsIcon name="magnifying-glass" class="size-3" />Search all folders
         </button>
      </div>

      <CmsSpinner v-if="library.loading.value" />

      <CmsEmptyState v-else-if="loadError" icon="exclamation-triangle" title="Could not load media">
         <CmsButton label="Retry" icon="arrow-path" variant="soft" @click="library.reload()" />
      </CmsEmptyState>

      <template v-else>
         <section v-if="recent.length" class="cms-media-section">
            <h3 class="cms-media-section-title"><CmsIcon name="clock" class="size-3.5" />Recent</h3>
            <div class="cms-media-grid is-compact is-recent">
               <button
                  v-for="item in recent"
                  :key="item.key"
                  type="button"
                  class="cms-card cms-media-tile is-selectable"
                  :title="mediaFilename(item.key)"
                  @click="emitSelect(item)"
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
                     <CmsIcon v-else :name="mediaIconFor(item.type)" class="size-6" />
                  </div>
               </button>
            </div>
         </section>

         <section v-if="visibleFolders.length" class="cms-media-section">
            <h3 v-if="query" class="cms-media-section-title">Folders</h3>
            <div class="cms-media-folders">
               <button
                  v-for="child in visibleFolders"
                  :key="child"
                  type="button"
                  class="cms-media-folder-tile"
                  :class="{ 'is-drop': dropTarget === targetId(child) }"
                  :draggable="canManage"
                  :title="child"
                  @click="openFolder(child)"
                  @dragstart="onFolderDragStart($event, child)"
                  @dragend="onDragEnd"
                  @dragover="onTargetDragOver($event, child)"
                  @dragleave="onTargetDragLeave(child)"
                  @drop="onTargetDrop($event, child)"
               >
                  <CmsIcon
                     :name="dropTarget === targetId(child) ? 'folder-open' : 'folder'"
                     class="cms-media-folder-tile-icon size-6"
                  />
                  <span class="cms-media-folder-tile-text">
                     <span class="cms-media-folder-tile-name">
                        {{ query ? child : mediaFolderName(child) }}
                     </span>
                     <span class="cms-media-folder-tile-meta">{{ folderMeta(child) }}</span>
                  </span>
               </button>
            </div>
         </section>

         <section v-if="visibleFiles.length" class="cms-media-section">
            <h3
               v-if="query || visibleFolders.length || recent.length"
               class="cms-media-section-title"
            >
               {{
                  query
                     ? `${visibleFiles.length} file${visibleFiles.length > 1 ? 's' : ''}`
                     : 'Files'
               }}
            </h3>

            <div
               v-if="view === 'grid'"
               class="cms-media-grid"
               :class="{ 'is-compact': selectable }"
            >
               <div
                  v-for="item in paged"
                  :key="item.key"
                  role="button"
                  tabindex="0"
                  class="cms-card cms-media-tile is-selectable"
                  :class="{
                     'is-checked': isSelected(item.key),
                     'is-dragging': draggingKeys.includes(item.key),
                  }"
                  :draggable="canManage"
                  :aria-pressed="canManage ? isSelected(item.key) : undefined"
                  @click="onItemClick(item, $event)"
                  @keydown.enter.prevent="onItemClick(item, $event)"
                  @keydown.space.prevent="
                     canManage ? toggleSelect(item.key, $event) : onItemClick(item, $event)
                  "
                  @dragstart="onItemDragStart($event, item)"
                  @dragend="onDragEnd"
               >
                  <div class="cms-media-preview">
                     <img
                        v-if="item.type === 'image' && item.url"
                        :src="item.url"
                        alt=""
                        loading="lazy"
                        draggable="false"
                     />
                     <video
                        v-else-if="item.type === 'video' && item.url"
                        :src="item.url"
                        preload="metadata"
                        muted
                        playsinline
                     />
                     <CmsIcon v-else :name="mediaIconFor(item.type)" class="size-8" />
                     <button
                        v-if="canManage"
                        type="button"
                        class="cms-media-check"
                        :class="{ 'is-on': isSelected(item.key), 'is-visible': selection.length }"
                        :aria-label="isSelected(item.key) ? 'Deselect' : 'Select'"
                        tabindex="-1"
                        @click.stop="toggleSelect(item.key, $event)"
                     >
                        <CmsIcon name="check" class="size-3.5" />
                     </button>
                     <div class="cms-media-info">
                        {{ tileInfo(item) }}
                     </div>
                  </div>
                  <div class="cms-media-meta">
                     <div class="cms-media-name" :title="item.key">
                        {{ mediaFilename(item.key) }}
                     </div>
                     <div v-if="query && item.folder" class="cms-media-folder">
                        <CmsIcon name="folder" class="size-3" />{{ item.folder }}
                     </div>
                  </div>
               </div>
            </div>

            <div v-else class="cms-card cms-media-list">
               <div
                  v-for="item in paged"
                  :key="item.key"
                  role="button"
                  tabindex="0"
                  class="cms-media-row"
                  :class="{
                     'is-checked': isSelected(item.key),
                     'is-dragging': draggingKeys.includes(item.key),
                  }"
                  :draggable="canManage"
                  @click="onItemClick(item, $event)"
                  @keydown.enter.prevent="onItemClick(item, $event)"
                  @keydown.space.prevent="
                     canManage ? toggleSelect(item.key, $event) : onItemClick(item, $event)
                  "
                  @dragstart="onItemDragStart($event, item)"
                  @dragend="onDragEnd"
               >
                  <button
                     v-if="canManage"
                     type="button"
                     class="cms-media-check is-visible"
                     :class="{ 'is-on': isSelected(item.key) }"
                     :aria-label="isSelected(item.key) ? 'Deselect' : 'Select'"
                     tabindex="-1"
                     @click.stop="toggleSelect(item.key, $event)"
                  >
                     <CmsIcon name="check" class="size-3.5" />
                  </button>
                  <CmsMediaThumb :value="item.key" />
                  <span class="cms-media-row-name" :title="item.key">
                     {{ mediaFilename(item.key) }}
                     <span v-if="query && item.folder" class="cms-media-folder">
                        <CmsIcon name="folder" class="size-3" />{{ item.folder }}
                     </span>
                  </span>
                  <span class="cms-media-row-cell is-mono">{{ extension(item.key) }}</span>
                  <span class="cms-media-row-cell">{{
                     item.size != null ? formatFileSize(item.size) : ''
                  }}</span>
                  <span class="cms-media-row-cell is-wide">
                     {{ item.width && item.height ? `${item.width}×${item.height}` : '' }}
                  </span>
                  <span class="cms-media-row-cell is-wide">
                     {{ item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '' }}
                  </span>
               </div>
            </div>
         </section>

         <CmsEmptyState v-if="!visibleFiles.length && !visibleFolders.length" v-bind="emptyState">
            <CmsButton
               v-if="query"
               label="Clear search"
               icon="x-mark"
               variant="soft"
               @click="search = ''"
            />
            <CmsButton
               v-else-if="canUpload && !hasTypedFiles"
               label="Upload"
               icon="cloud-arrow-up"
               variant="soft"
               @click="uploadOpen = true"
            />
         </CmsEmptyState>

         <CmsPagination
            v-if="visibleFiles.length > PAGE_SIZE"
            v-model:page="page"
            :total="visibleFiles.length"
            :items-per-page="PAGE_SIZE"
         />
      </template>

      <div v-if="fileDragActive" class="cms-media-drop-overlay">
         <CmsIcon name="cloud-arrow-up" class="size-8" />
         <span
            >Drop to upload to <strong>{{ dropTargetLabel }}</strong></span
         >
      </div>

      <CmsModal v-if="canUpload" v-model:open="uploadOpen" title="Upload media">
         <template #body>
            <CmsMediaUpload
               :multiple="!selectable"
               :media-type="mediaType"
               :accept="accept"
               :folder="folder"
               :directories="!selectable"
               @uploaded="onUploaded"
            />
            <p class="cms-form-hint cms-media-upload-hint">
               Tip: you can also drop files or folders anywhere on the library, or on a folder.
            </p>
         </template>
      </CmsModal>

      <CmsModal v-if="canUpload" v-model:open="newFolderOpen" title="New folder" size="sm">
         <template #body>
            <div class="cms-form">
               <CmsFormField label="Name">
                  <CmsInput
                     v-model="folderName"
                     autofocus
                     placeholder="e.g. covers"
                     @keydown.enter.prevent="createFolder"
                  />
                  <p class="cms-form-hint">
                     {{
                        newFolderPath ? `Creates ${newFolderPath}/` : 'Letters, numbers and dashes.'
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
                  <CmsButton
                     label="Create"
                     :loading="busy"
                     :disabled="!newFolderPath"
                     @click="createFolder"
                  />
               </div>
            </div>
         </template>
      </CmsModal>

      <CmsModal v-if="canManage" v-model:open="renameOpen" title="Rename folder" size="sm">
         <template #body>
            <div class="cms-form">
               <CmsFormField label="Name">
                  <CmsInput v-model="folderName" autofocus @keydown.enter.prevent="renameFolder" />
               </CmsFormField>
               <CmsFormField label="Location">
                  <CmsMediaFolderPicker
                     v-model="renameParent"
                     :folders="parentCandidates"
                     :exclude="folder"
                  />
               </CmsFormField>
               <p class="cms-form-hint">
                  {{
                     renamePath
                        ? `Moves ${folder}/ to ${renamePath}/`
                        : 'Letters, numbers and dashes.'
                  }}
               </p>
               <div class="cms-actions is-end">
                  <CmsButton
                     label="Cancel"
                     variant="ghost"
                     color="neutral"
                     @click="renameOpen = false"
                  />
                  <CmsButton
                     label="Save"
                     :loading="busy"
                     :disabled="!renamePath || renamePath === folder"
                     @click="renameFolder"
                  />
               </div>
            </div>
         </template>
      </CmsModal>

      <CmsModal
         v-if="canManage"
         v-model:open="moveOpen"
         :title="`Move ${selection.length} file${selection.length > 1 ? 's' : ''}`"
         size="sm"
      >
         <template #body>
            <div class="cms-form">
               <CmsMediaFolderPicker v-model="moveTarget" :folders="library.folders.value" />
               <div class="cms-actions is-end">
                  <CmsButton
                     label="Cancel"
                     variant="ghost"
                     color="neutral"
                     @click="moveOpen = false"
                  />
                  <CmsButton label="Move here" :loading="busy" @click="moveSelection" />
               </div>
            </div>
         </template>
      </CmsModal>

      <CmsMediaDetail
         v-if="!selectable"
         :item="detail"
         :library="library"
         :read-only="readOnly"
         @close="detailKey = null"
         @delete="(item) => removeItems([item])"
      />
   </div>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { computed, onMounted, ref, watch } from '#imports'
import {
   isWithinMediaFolder,
   MEDIA_FOLDER_MAX_DEPTH,
   MEDIA_TYPES,
   formatFileSize,
   mediaFilename,
   mediaFolderAncestors,
   mediaFolderDepth,
   mediaFolderName,
   mediaFolderParent,
   mediaIconFor,
   mediaTypeAccept,
   mediaTypeFilter,
   rebaseMediaFolder,
   slugify,
} from '#nuxt-cms'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsMediaLibrary, usageSummary } from '../../composables/cms-media-library'
import type { UploadTree } from '../../composables/cms-media-uploader'
import {
   uploadTreeFromDrop,
   uploadTreeFromFiles,
   useCmsMediaUploader,
} from '../../composables/cms-media-uploader'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'

type SortKey = 'newest' | 'oldest' | 'name' | 'size'

const MEDIA_DRAG = 'application/x-cms-media'
const FOLDER_DRAG = 'application/x-cms-folder'
const VIEW_STORAGE_KEY = 'cms-media-view'
const PAGE_SIZE = 24
const RECENT_COUNT = 6

const filterLabels: Record<string, string> = {
   all: 'All',
   image: 'Images',
   video: 'Videos',
   file: 'Files',
}

const sortLabels: Record<SortKey, string> = {
   newest: 'Newest',
   oldest: 'Oldest',
   name: 'Name',
   size: 'Largest',
}

const props = defineProps<{
   selectable?: boolean
   mediaType?: MediaType | MediaType[]
   accept?: string[]
}>()

const emit = defineEmits<{ select: [item: { key: string; url: string | null }] }>()

const folder = defineModel<string | null>('folder', { default: null })

const toast = useCmsToast()
const confirmAction = useCmsConfirm()
const runtime = useCmsRuntime()
const library = useCmsMediaLibrary()
const uploader = useCmsMediaUploader()

const readOnly = computed(() => runtime.mediaStorage === 'local')
const canUpload = computed(() => !readOnly.value)
const canManage = computed(() => !readOnly.value && !props.selectable)
const canNest = computed(() => mediaFolderDepth(folder.value) < MEDIA_FOLDER_MAX_DEPTH)

onMounted(() => library.reload())

const notConfigured = computed(() => library.errorCode.value === 501)
const loadError = computed(
   () => library.errorCode.value !== null && library.errorCode.value !== 501
)

const sourceHint = computed(() => {
   const source = library.source.value
   if (!readOnly.value || !source) return null
   const { kind, root, builtAt } = source
   if (kind === 'filesystem') return `Read live from ${root}`
   if (kind === 'manifest') {
      const when = builtAt ? new Date(builtAt).toLocaleString() : 'the last build'
      return `From the build of ${when}. Add files to ${root} and redeploy to update.`
   }
   return 'No media folder was found at build time. Check cms.media.publicBaseUrl.'
})

watch(
   () => [library.loading.value, library.folders.value] as const,
   ([loading, folders]) => {
      if (loading || !folder.value || folders.includes(folder.value)) return
      folder.value =
         mediaFolderAncestors(folder.value)
            .reverse()
            .find((ancestor) => folders.includes(ancestor)) ?? null
   }
)

const allowedTypes = computed(() => mediaTypeFilter(props.mediaType))
const acceptAttr = computed(
   () => (props.accept?.length ? props.accept : mediaTypeAccept(props.mediaType))?.join(',')
)
const filters = computed<('all' | MediaType)[]>(() => [
   'all',
   ...(allowedTypes.value ?? MEDIA_TYPES),
])
const filter = ref<'all' | MediaType>('all')

watch(filters, (list) => {
   if (!list.includes(filter.value)) filter.value = 'all'
})

const typedItems = computed(() => {
   const allowed = allowedTypes.value
   return allowed
      ? library.items.value.filter((item) => allowed.includes(item.type))
      : library.items.value
})

const hasTypedFiles = computed(() => typedItems.value.length > 0)
const showTypeFilters = computed(() => filters.value.length > 2 && hasTypedFiles.value)

const search = ref('')
const searchEverywhere = ref(false)
const query = computed(() => search.value.trim().toLowerCase())
const scope = computed(() => (searchEverywhere.value ? null : folder.value))

const hasDates = computed(() => library.items.value.some((item) => item.createdAt))
const sort = ref<SortKey>('newest')

const activeSort = computed<SortKey>(() =>
   !hasDates.value && (sort.value === 'newest' || sort.value === 'oldest') ? 'name' : sort.value
)

const sortItems = computed(() =>
   (Object.keys(sortLabels) as SortKey[])
      .filter((key) => hasDates.value || (key !== 'newest' && key !== 'oldest'))
      .map((key) => ({
         label: sortLabels[key],
         type: 'checkbox' as const,
         checked: activeSort.value === key,
         onUpdateChecked: () => {
            sort.value = key
         },
      }))
)

function compareItems(a: MediaItem, b: MediaItem) {
   const byName = mediaFilename(a.key).localeCompare(mediaFilename(b.key))
   if (activeSort.value === 'name') return byName
   if (activeSort.value === 'size') return (b.size ?? 0) - (a.size ?? 0) || byName
   const delta = (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
   return (activeSort.value === 'newest' ? delta : -delta) || byName
}

function matchesQuery(value: string | null | undefined) {
   return !!value && value.toLowerCase().includes(query.value)
}

const visibleFolders = computed(() => {
   if (!query.value) return library.childFolders(folder.value)
   return library.folders.value.filter(
      (candidate) =>
         candidate !== scope.value &&
         isWithinMediaFolder(candidate, scope.value) &&
         matchesQuery(mediaFolderName(candidate))
   )
})

const visibleFiles = computed(() => {
   let list = typedItems.value
   if (filter.value !== 'all') list = list.filter((item) => item.type === filter.value)
   if (query.value) {
      list = list.filter(
         (item) =>
            isWithinMediaFolder(item.folder, scope.value) &&
            [mediaFilename(item.key), item.alt, item.folder].some(matchesQuery)
      )
   } else {
      list = list.filter((item) => (item.folder ?? null) === folder.value)
   }
   return [...list].sort(compareItems)
})

const recent = computed(() => {
   if (!props.selectable || query.value || folder.value || page.value > 1) return []
   if (typedItems.value.length <= RECENT_COUNT) return []
   return typedItems.value
      .filter((item) => item.createdAt)
      .sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!))
      .slice(0, RECENT_COUNT)
})

const page = ref(1)

watch([filter, folder, query, searchEverywhere, sort], () => {
   page.value = 1
})

watch(visibleFiles, (list) => {
   const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
   if (page.value > pageCount) page.value = pageCount
})

const paged = computed(() =>
   visibleFiles.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

const emptyState = computed(() => {
   if (query.value) {
      return {
         icon: 'magnifying-glass',
         title: 'No matching media',
         body:
            searchEverywhere.value || !folder.value
               ? 'Try a different search or filter.'
               : 'Nothing here matches. Try searching all folders.',
      }
   }
   if (!library.items.value.length && !library.folders.value.length) {
      return {
         icon: 'photo',
         title: readOnly.value ? 'No media' : 'No media yet',
         body: readOnly.value
            ? 'No media registered.'
            : 'Drop files here or use Upload to add some.',
      }
   }
   if (folder.value) {
      return {
         icon: 'folder-open',
         title: 'This folder is empty',
         body: canUpload.value ? 'Drop files here or use Upload to add some.' : undefined,
      }
   }
   return {
      icon: 'photo',
      title: hasTypedFiles.value ? 'No files in the library root' : 'No matching media',
      body: hasTypedFiles.value ? 'Open a folder to see its files.' : 'No files of this type yet.',
   }
})

const view = ref<'grid' | 'list'>('grid')

onMounted(() => {
   try {
      if (localStorage.getItem(VIEW_STORAGE_KEY) === 'list') view.value = 'list'
   } catch {}
})

watch(view, (value) => {
   try {
      localStorage.setItem(VIEW_STORAGE_KEY, value)
   } catch {}
})

const crumbs = computed(() => [
   { label: 'Library', folder: null as string | null },
   ...(folder.value
      ? mediaFolderAncestors(folder.value).map((path) => ({
           label: mediaFolderName(path),
           folder: path as string | null,
        }))
      : []),
])

function openFolder(target: string | null) {
   folder.value = target
   search.value = ''
   searchEverywhere.value = false
}

function folderMeta(path: string) {
   const stats = library.stats.value.get(path)
   if (!stats) return 'Empty'
   const parts: string[] = []
   if (stats.folders) parts.push(`${stats.folders} folder${stats.folders > 1 ? 's' : ''}`)
   if (stats.files) parts.push(`${stats.files} file${stats.files > 1 ? 's' : ''}`)
   return parts.join(' · ') || 'Empty'
}

const selection = ref<string[]>([])
const lastSelected = ref<string | null>(null)

const selectedItems = computed(() => {
   const keys = new Set(selection.value)
   return library.items.value.filter((item) => keys.has(item.key))
})

watch(folder, () => clearSelection())

watch(
   () => library.items.value,
   (items) => {
      const keys = new Set(items.map((item) => item.key))
      selection.value = selection.value.filter((key) => keys.has(key))
   }
)

function isSelected(key: string) {
   return selection.value.includes(key)
}

function toggleSelect(key: string, event?: Event) {
   const shift = (event as MouseEvent | undefined)?.shiftKey
   if (shift && lastSelected.value) {
      const keys = visibleFiles.value.map((item) => item.key)
      const from = keys.indexOf(lastSelected.value)
      const to = keys.indexOf(key)
      if (from !== -1 && to !== -1) {
         const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1)
         selection.value = [...new Set([...selection.value, ...range])]
         lastSelected.value = key
         return
      }
   }
   selection.value = isSelected(key)
      ? selection.value.filter((entry) => entry !== key)
      : [...selection.value, key]
   lastSelected.value = key
}

function selectAll() {
   selection.value = visibleFiles.value.map((item) => item.key)
}

function clearSelection() {
   selection.value = []
   lastSelected.value = null
}

const detailKey = ref<string | null>(null)
const detail = computed(
   () => library.items.value.find((item) => item.key === detailKey.value) ?? null
)

function emitSelect(item: MediaItem) {
   emit('select', { key: item.key, url: item.url })
}

function onItemClick(item: MediaItem, event: Event) {
   if (props.selectable) {
      emitSelect(item)
      return
   }
   if (
      canManage.value &&
      (selection.value.length ||
         (event as MouseEvent).metaKey ||
         (event as MouseEvent).ctrlKey ||
         (event as MouseEvent).shiftKey)
   ) {
      toggleSelect(item.key, event)
      return
   }
   detailKey.value = item.key
}

const busy = ref(false)

async function run(action: () => Promise<boolean>) {
   if (busy.value) return false
   busy.value = true
   try {
      return await action()
   } finally {
      busy.value = false
   }
}

const newFolderOpen = ref(false)
const folderName = ref('')
const folderSlug = computed(() => slugify(folderName.value))
const newFolderPath = computed(() =>
   folderSlug.value
      ? folder.value
         ? `${folder.value}/${folderSlug.value}`
         : folderSlug.value
      : null
)

function openNewFolder() {
   folderName.value = ''
   newFolderOpen.value = true
}

async function createFolder() {
   const path = newFolderPath.value
   if (!path) return
   if (library.folders.value.includes(path)) {
      newFolderOpen.value = false
      openFolder(path)
      return
   }
   const ok = await run(() => library.createFolder(path))
   if (!ok) return
   newFolderOpen.value = false
   openFolder(path)
}

const renameOpen = ref(false)
const renameParent = ref<string | null>(null)

const parentCandidates = computed(() => {
   const own = folder.value
   if (!own) return []
   const subtreeDepth = Math.max(
      ...library.folders.value
         .filter((candidate) => isWithinMediaFolder(candidate, own))
         .map((candidate) => mediaFolderDepth(candidate) - mediaFolderDepth(own) + 1)
   )
   return library.folders.value.filter(
      (candidate) => mediaFolderDepth(candidate) + subtreeDepth <= MEDIA_FOLDER_MAX_DEPTH
   )
})

const renamePath = computed(() => {
   if (!folderSlug.value) return null
   return renameParent.value ? `${renameParent.value}/${folderSlug.value}` : folderSlug.value
})

function openRename() {
   if (!folder.value) return
   folderName.value = mediaFolderName(folder.value)
   renameParent.value = mediaFolderParent(folder.value)
   renameOpen.value = true
}

async function renameFolder() {
   const from = folder.value
   const to = renamePath.value
   if (!from || !to || from === to) return
   const ok = await run(() => library.moveFolder(from, to))
   if (!ok) return
   renameOpen.value = false
   openFolder(to)
}

async function removeFolder(path: string) {
   const files = library.itemsWithin(path)
   const subfolders = library.folders.value.filter(
      (candidate) => candidate !== path && isWithinMediaFolder(candidate, path)
   ).length
   const contents: string[] = []
   if (subfolders) contents.push(`${subfolders} subfolder${subfolders > 1 ? 's' : ''}`)
   if (files.length) contents.push(`${files.length} file${files.length > 1 ? 's' : ''}`)
   const keys = files.map((item) => item.key)
   const summary = usageSummary(await library.usage(keys), keys)
   const message = contents.length
      ? `Delete "${mediaFolderName(path)}" with ${contents.join(' and ')}? ${summary}`
      : `Delete the empty folder "${mediaFolderName(path)}"?`
   if (!(await confirmAction(message.trim(), { title: 'Delete folder', confirmLabel: 'Delete' })))
      return
   const ok = await run(() => library.deleteFolder(path))
   if (ok && folder.value && isWithinMediaFolder(folder.value, path)) {
      openFolder(mediaFolderParent(path))
   }
}

async function removeItems(items: MediaItem[]) {
   if (!items.length) return
   const keys = items.map((item) => item.key)
   const summary = usageSummary(await library.usage(keys), keys)
   const question =
      keys.length === 1 ? `Delete "${mediaFilename(keys[0]!)}"?` : `Delete ${keys.length} files?`
   if (
      !(await confirmAction(`${question} ${summary}`.trim(), {
         title: 'Delete',
         confirmLabel: 'Delete',
      }))
   )
      return
   const ok = await run(() => library.deleteItems(keys))
   if (!ok) return
   if (detailKey.value && keys.includes(detailKey.value)) detailKey.value = null
   clearSelection()
}

const moveOpen = ref(false)
const moveTarget = ref<string | null>(null)

function openMove() {
   moveTarget.value = folder.value
   moveOpen.value = true
}

async function moveKeys(keys: string[], target: string | null) {
   const moving = keys.filter(
      (key) => (library.items.value.find((item) => item.key === key)?.folder ?? null) !== target
   )
   if (!moving.length) return true
   const ok = await run(() => library.moveItems(moving, target))
   if (ok) {
      toast.add({
         title: `Moved ${moving.length} file${moving.length > 1 ? 's' : ''} to ${
            target ?? 'Library root'
         }`,
         color: 'success',
      })
   }
   return ok
}

async function moveSelection() {
   const ok = await moveKeys(selection.value, moveTarget.value)
   if (!ok) return
   moveOpen.value = false
   clearSelection()
}

const uploadOpen = ref(false)

async function afterUpload(uploaded: MediaItem[]) {
   if (!uploaded.length) {
      if (!props.selectable) await library.reload({ quiet: true })
      return
   }
   if (props.selectable && uploaded[0]) {
      emitSelect(uploaded[0])
      return
   }
   await library.reload({ quiet: true })
   toast.add({
      title: `Uploaded ${uploaded.length} file${uploaded.length > 1 ? 's' : ''}`,
      color: 'success',
   })
}

function onUploaded(uploaded: MediaItem[]) {
   uploadOpen.value = false
   void afterUpload(uploaded)
}

function droppedTree(event: DragEvent): Promise<UploadTree> | null {
   const data = event.dataTransfer
   if (!data?.files.length) return null
   return props.selectable
      ? Promise.resolve(uploadTreeFromFiles(data.files))
      : uploadTreeFromDrop(data)
}

async function uploadTree(pending: Promise<UploadTree>, target: string | null) {
   const tree = await pending
   const uploaded = await uploader.upload(tree, {
      folder: target,
      accept: acceptAttr.value,
      multiple: !props.selectable,
   })
   if (uploaded.length || tree.directories.length) await afterUpload(uploaded)
}

const draggingKeys = ref<string[]>([])
const draggingFolder = ref<string | null>(null)
const dropTarget = ref<string | null>(null)
const fileDragDepth = ref(0)
const fileDragActive = computed(() => fileDragDepth.value > 0 && canUpload.value)

const ROOT_TARGET = ':root'

function targetId(target: string | null) {
   return target ?? ROOT_TARGET
}

const dropTargetLabel = computed(() => {
   if (!dropTarget.value) return folder.value ?? 'Library root'
   return dropTarget.value === ROOT_TARGET ? 'Library root' : dropTarget.value
})

function hasFiles(event: DragEvent) {
   return !!event.dataTransfer?.types.includes('Files')
}

function onItemDragStart(event: DragEvent, item: MediaItem) {
   if (!canManage.value || !event.dataTransfer) return
   const keys = isSelected(item.key) ? [...selection.value] : [item.key]
   draggingKeys.value = keys
   event.dataTransfer.effectAllowed = 'move'
   event.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(keys))
}

function onFolderDragStart(event: DragEvent, path: string) {
   if (!canManage.value || !event.dataTransfer) return
   draggingFolder.value = path
   event.dataTransfer.effectAllowed = 'move'
   event.dataTransfer.setData(FOLDER_DRAG, path)
}

function onDragEnd() {
   draggingKeys.value = []
   draggingFolder.value = null
   dropTarget.value = null
}

function folderMoveTarget(path: string, target: string | null) {
   const name = mediaFolderName(path)
   return target ? `${target}/${name}` : name
}

function acceptsDrop(event: DragEvent, target: string | null) {
   if (draggingKeys.value.length) return true
   if (draggingFolder.value) {
      const from = draggingFolder.value
      if (target && isWithinMediaFolder(target, from)) return false
      if (mediaFolderParent(from) === target) return false
      const depth = Math.max(
         ...library.folders.value
            .filter((candidate) => isWithinMediaFolder(candidate, from))
            .map((candidate) => mediaFolderDepth(candidate) - mediaFolderDepth(from) + 1)
      )
      return mediaFolderDepth(target) + depth <= MEDIA_FOLDER_MAX_DEPTH
   }
   return hasFiles(event) && canUpload.value
}

function onTargetDragOver(event: DragEvent, target: string | null) {
   if (!acceptsDrop(event, target)) return
   event.preventDefault()
   event.stopPropagation()
   if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'move'
   dropTarget.value = targetId(target)
}

function onTargetDragLeave(target: string | null) {
   if (dropTarget.value === targetId(target)) dropTarget.value = null
}

async function onTargetDrop(event: DragEvent, target: string | null) {
   if (!acceptsDrop(event, target)) return
   event.preventDefault()
   event.stopPropagation()
   const keys = [...draggingKeys.value]
   const path = draggingFolder.value
   const tree = hasFiles(event) ? droppedTree(event) : null
   onDragEnd()
   fileDragDepth.value = 0
   if (keys.length) {
      if (await moveKeys(keys, target)) clearSelection()
      return
   }
   if (path) {
      const to = folderMoveTarget(path, target)
      const ok = await run(() => library.moveFolder(path, to))
      if (ok && folder.value && isWithinMediaFolder(folder.value, path)) {
         folder.value = rebaseMediaFolder(folder.value, path, to)
      }
      return
   }
   if (tree) await uploadTree(tree, target)
}

function onGalleryDragEnter(event: DragEvent) {
   if (!hasFiles(event) || !canUpload.value) return
   fileDragDepth.value++
}

function onGalleryDragOver(event: DragEvent) {
   if (!hasFiles(event) || !canUpload.value) return
   event.preventDefault()
   if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onGalleryDragLeave(event: DragEvent) {
   if (!hasFiles(event) || !canUpload.value) return
   fileDragDepth.value = Math.max(0, fileDragDepth.value - 1)
}

async function onGalleryDrop(event: DragEvent) {
   if (!hasFiles(event) || !canUpload.value) return
   event.preventDefault()
   fileDragDepth.value = 0
   dropTarget.value = null
   const tree = droppedTree(event)
   if (tree) await uploadTree(tree, folder.value)
}

function tileInfo(item: MediaItem) {
   const parts = [extension(item.key)]
   if (item.size != null) parts.push(formatFileSize(item.size))
   if (item.width && item.height) parts.push(`${item.width}×${item.height}`)
   return parts.join(' · ')
}

function extension(key: string) {
   const dot = key.lastIndexOf('.')
   return dot === -1 ? 'file' : key.slice(dot + 1).toLowerCase()
}
</script>
