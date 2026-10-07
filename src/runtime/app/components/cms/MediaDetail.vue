<template>
   <CmsDrawer :open="!!item" :title="item ? mediaFilename(item.key) : ''" @close="emit('close')">
      <div v-if="item" class="cms-media-detail">
         <div class="cms-media-detail-preview">
            <img v-if="item.type === 'image' && item.url" :src="item.url" :alt="item.alt ?? ''" />
            <video
               v-else-if="item.type === 'video' && item.url"
               :src="item.url"
               controls
               preload="metadata"
               playsinline
            />
            <CmsIcon v-else :name="mediaIconFor(item.type)" class="size-12" />
         </div>

         <div class="cms-actions">
            <template v-if="item.url">
               <CmsButton
                  :label="copied ? 'Copied' : 'Copy URL'"
                  :icon="copied ? 'check' : 'clipboard-document'"
                  variant="soft"
                  color="neutral"
                  size="sm"
                  @click="copyUrl"
               />
               <a
                  :href="item.url"
                  target="_blank"
                  rel="noopener"
                  class="cms-btn cms-btn-sm cms-btn-neutral cms-btn-ghost"
               >
                  <CmsIcon name="arrow-top-right-on-square" class="size-4 shrink-0" />Open
               </a>
            </template>
            <a
               :href="downloadHref"
               download
               class="cms-btn cms-btn-sm cms-btn-neutral cms-btn-ghost"
            >
               <CmsIcon name="arrow-down-tray" class="size-4 shrink-0" />Download
            </a>
         </div>

         <dl class="cms-media-detail-facts">
            <template v-for="fact in facts" :key="fact.label">
               <dt>{{ fact.label }}</dt>
               <dd :class="{ 'is-mono': fact.mono }" :title="fact.value">{{ fact.value }}</dd>
            </template>
         </dl>

         <div class="cms-form">
            <CmsFormField label="Alt text">
               <CmsInput
                  v-model="alt"
                  placeholder="Describe the image for screen readers"
                  @keydown.enter.prevent="save"
               />
            </CmsFormField>
            <CmsFormField v-if="!readOnly" label="Folder">
               <CmsMediaFolderPicker v-model="folder" :folders="folders" />
            </CmsFormField>
         </div>

         <section class="cms-media-detail-usage">
            <h3 class="cms-media-section-title">Used in</h3>
            <CmsSpinner v-if="usageLoading" />
            <p v-else-if="usageList === null" class="cms-form-hint">
               Could not check where this file is used.
            </p>
            <p v-else-if="!usageList.length" class="cms-form-hint">Not used in any entry.</p>
            <ul v-else class="cms-media-usage-list">
               <li v-for="(entry, index) in usageList" :key="index">
                  <NuxtLink
                     :to="usageLink(entry)"
                     class="cms-media-usage-link"
                     @click="emit('close')"
                  >
                     <span class="cms-media-usage-title">{{ entry.title ?? entry.label }}</span>
                     <span class="cms-media-usage-meta">{{ entry.label }} · {{ entry.field }}</span>
                  </NuxtLink>
               </li>
            </ul>
         </section>
      </div>

      <template #footer>
         <CmsButton
            v-if="!readOnly"
            label="Delete"
            icon="trash"
            variant="ghost"
            color="error"
            @click="item && emit('delete', item)"
         />
         <span v-else />
         <div class="cms-actions">
            <CmsButton label="Close" variant="ghost" color="neutral" @click="emit('close')" />
            <CmsButton label="Save" :loading="saving" :disabled="!dirty" @click="save" />
         </div>
      </template>
   </CmsDrawer>
</template>

<script setup lang="ts">
import type { MediaItem, MediaUsage } from '#nuxt-cms'
import { computed, ref, watch } from '#imports'
import { formatFileSize, mediaFilename, mediaIconFor } from '#nuxt-cms'
import type { CmsMediaLibrary } from '../../composables/cms-media-library'
import { usageLink } from '../../composables/cms-media-library'

const props = defineProps<{
   item: MediaItem | null
   library: CmsMediaLibrary
   readOnly: boolean
}>()

const emit = defineEmits<{ close: []; delete: [item: MediaItem] }>()

const folders = computed(() => props.library.folders.value)

const alt = ref('')
const folder = ref<string | null>(null)
const saving = ref(false)
const copied = ref(false)
const usageList = ref<MediaUsage[] | null>([])
const usageLoading = ref(false)

watch(
   () => props.item?.key,
   async (key) => {
      if (!props.item || !key) return
      alt.value = props.item.alt ?? ''
      folder.value = props.item.folder ?? null
      copied.value = false
      usageLoading.value = true
      const usage = await props.library.usage([key])
      if (props.item?.key !== key) return
      usageList.value = usage ? usage[key] ?? [] : null
      usageLoading.value = false
   },
   { immediate: true }
)

const dirty = computed(() => {
   if (!props.item) return false
   return (
      (alt.value.trim() || null) !== (props.item.alt ?? null) ||
      (!props.readOnly && folder.value !== (props.item.folder ?? null))
   )
})

const downloadHref = computed(() =>
   props.item ? `/api/cms/admin/media/download?key=${encodeURIComponent(props.item.key)}` : ''
)

const facts = computed(() => {
   const item = props.item
   if (!item) return []
   const list: { label: string; value: string; mono?: boolean }[] = [
      { label: 'Folder', value: item.folder ?? 'Library root' },
      { label: 'Type', value: item.mime ?? item.type },
   ]
   if (item.size != null) list.push({ label: 'Size', value: formatFileSize(item.size) })
   if (item.width && item.height) {
      list.push({ label: 'Dimensions', value: `${item.width} × ${item.height}` })
   }
   if (item.createdAt) {
      list.push({ label: 'Uploaded', value: new Date(item.createdAt).toLocaleString() })
   }
   list.push({ label: 'Key', value: item.key, mono: true })
   return list
})

async function copyUrl() {
   if (!props.item?.url) return
   const url = new URL(props.item.url, window.location.origin).toString()
   try {
      await navigator.clipboard.writeText(url)
      copied.value = true
      setTimeout(() => (copied.value = false), 1500)
   } catch {
      copied.value = false
   }
}

async function save() {
   if (!props.item || !dirty.value || saving.value) return
   saving.value = true
   const ok = await props.library.updateItem(props.item.key, {
      alt: alt.value.trim() || null,
      ...(props.readOnly ? {} : { folder: folder.value }),
   })
   saving.value = false
   if (ok) emit('close')
}
</script>
