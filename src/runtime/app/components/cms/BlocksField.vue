<template>
   <div class="flex flex-col gap-3">
      <div class="cms-blocks-grid">
         <div
            v-for="(item, index) in items"
            :key="uidFor(item)"
            class="cms-card cms-block-tile"
            :class="{
               'is-muted': isHidden(item),
               'is-dragging': dragIndex === index,
               'is-drop-target': dropIndex === index && dragIndex !== index,
            }"
            draggable="true"
            @dragstart="onDragStart(index, $event)"
            @dragover.prevent="dropIndex = index"
            @dragleave="onDragLeave(index)"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
         >
            <button
               type="button"
               class="cms-block-preview"
               :aria-label="`Edit ${labelOf(item)}`"
               @click="openEditor(index)"
            >
               <img
                  v-if="previewOf(item)?.kind === 'image'"
                  :src="previewOf(item)!.url"
                  alt=""
                  loading="lazy"
               />
               <video
                  v-else-if="previewOf(item)?.kind === 'video'"
                  :src="previewOf(item)!.url"
                  preload="metadata"
                  muted
                  playsinline
               />
               <span v-else-if="summaryOf(item)" class="cms-block-summary">
                  {{ summaryOf(item) }}
               </span>
               <CmsIcon v-else :name="iconOf(item)" class="size-7" />

               <CmsIcon v-if="isHidden(item)" name="eye-slash" class="cms-block-hidden size-4" />
            </button>

            <div class="cms-block-bar">
               <button
                  type="button"
                  class="cms-block-grip"
                  :aria-label="`Reorder ${labelOf(item)}, use the arrow keys`"
                  @keydown.left.prevent="index > 0 && move(index, -1)"
                  @keydown.right.prevent="index < items.length - 1 && move(index, 1)"
               >
                  <CmsIcon name="bars-2" class="size-4" />
               </button>
               <span class="cms-block-bar-name" :title="labelOf(item)">{{ labelOf(item) }}</span>
               <div class="cms-block-bar-actions">
                  <CmsButton
                     icon="trash"
                     size="xs"
                     variant="ghost"
                     color="error"
                     aria-label="Remove block"
                     @click="remove(index)"
                  />
               </div>
            </div>
         </div>

         <CmsDropdownMenu v-if="addItems.length > 1" :items="addItems">
            <button type="button" class="cms-block-add">
               <CmsIcon name="plus" class="size-5" />
               <span>Add</span>
            </button>
         </CmsDropdownMenu>
         <button v-else type="button" class="cms-block-add" @click="addFirst">
            <CmsIcon name="plus" class="size-5" />
            <span>Add</span>
         </button>
      </div>

      <CmsModal v-model:open="editorOpen" :title="editorTitle">
         <template #body>
            <div class="flex flex-col gap-4">
               <CmsFormField
                  v-for="(blockField, blockKey) in editorFields"
                  :key="blockKey"
                  :label="blockField.label"
                  :required="blockField.required"
               >
                  <CmsFieldInput
                     :model-value="editorItem?.[blockKey]"
                     :field="blockField"
                     :locale="locale"
                     @update:model-value="(value: unknown) => updateEditorField(blockKey, value)"
                  />
               </CmsFormField>

               <div class="cms-actions justify-between">
                  <div class="cms-actions">
                     <CmsButton
                        icon="chevron-left"
                        variant="soft"
                        color="neutral"
                        aria-label="Move earlier"
                        :disabled="editorIndex === 0"
                        @click="moveCurrent(-1)"
                     />
                     <CmsButton
                        icon="chevron-right"
                        variant="soft"
                        color="neutral"
                        aria-label="Move later"
                        :disabled="editorIndex === items.length - 1"
                        @click="moveCurrent(1)"
                     />
                     <CmsButton
                        label="Duplicate"
                        icon="document-duplicate"
                        variant="soft"
                        color="neutral"
                        @click="duplicateCurrent"
                     />
                  </div>
                  <div class="cms-actions">
                     <CmsButton
                        label="Remove"
                        icon="trash"
                        variant="soft"
                        color="error"
                        @click="removeCurrent"
                     />
                     <CmsButton label="Done" @click="editorOpen = false" />
                  </div>
               </div>
            </div>
         </template>
      </CmsModal>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import {
   isTranslatableMediaField,
   mediaIconFor,
   mediaPublicUrl,
   mediaTypeForKey,
   pickTranslatedMedia,
} from '#nuxt-cms'
import { computed, ref } from '#imports'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ field: FieldConfig; locale?: string }>()

const model = defineModel<Record<string, unknown>[] | null>({ required: true })

const { mediaBaseUrl, i18n } = useCmsRuntime()

const blocks = computed(() => props.field.blocks ?? {})
const items = computed(() => (Array.isArray(model.value) ? model.value : []))

let uidCounter = 0
const uids = new WeakMap<Record<string, unknown>, number>()

function uidFor(item: Record<string, unknown>) {
   let uid = uids.get(item)
   if (uid === undefined) {
      uid = ++uidCounter
      uids.set(item, uid)
   }
   return uid
}

function blockOf(item: Record<string, unknown>) {
   return blocks.value[item.type as string]
}

function labelOf(item: Record<string, unknown>) {
   return blockOf(item)?.label ?? String(item.type)
}

function mediaKeyOf(item: Record<string, unknown>) {
   const locale = props.locale ?? i18n.defaultLocale
   for (const [key, field] of Object.entries(blockOf(item)?.fields ?? {})) {
      if (field.type !== 'media') continue
      const raw = item[key]
      const value = isTranslatableMediaField(field)
         ? pickTranslatedMedia(raw as Record<string, string> | null, locale, i18n.defaultLocale)
         : raw
      if (typeof value === 'string' && value) return value
   }
   return null
}

function previewOf(item: Record<string, unknown>) {
   const key = mediaKeyOf(item)
   if (!key) return null
   const url = mediaPublicUrl(mediaBaseUrl, key)
   if (!url) return null
   return { url, kind: mediaTypeForKey(key) }
}

function iconOf(item: Record<string, unknown>) {
   const key = mediaKeyOf(item)
   return key ? mediaIconFor(mediaTypeForKey(key)) : 'rectangle-stack'
}

function summaryOf(item: Record<string, unknown>) {
   for (const [key, field] of Object.entries(blockOf(item)?.fields ?? {})) {
      if (field.type !== 'text' && field.type !== 'richtext') continue
      const raw = item[key]
      const value =
         typeof raw === 'string'
            ? raw
            : (raw as Record<string, string> | null)?.[props.locale ?? i18n.defaultLocale] ?? ''
      const text = value.replace(/<[^>]*>/g, ' ').trim()
      if (text) return text.length > 80 ? `${text.slice(0, 77)}…` : text
   }
   return ''
}

function isHidden(item: Record<string, unknown>) {
   return blockOf(item)?.fields.hidden?.type === 'boolean' && item.hidden === true
}

function updateField(index: number, key: string, value: unknown) {
   const current = items.value[index]
   if (!current) return
   const updated = { ...current, [key]: value }
   uids.set(updated, uidFor(current))
   model.value = items.value.map((item, i) => (i === index ? updated : item))
}

function add(type: string) {
   const block = blocks.value[type]
   if (!block) return
   const empty = Object.fromEntries(Object.keys(block.fields).map((k) => [k, null]))
   model.value = [...items.value, { type, ...empty }]
   openEditor(items.value.length - 1)
}

function addFirst() {
   const first = Object.keys(blocks.value)[0]
   if (first) add(first)
}

function remove(index: number) {
   const next = items.value.filter((_, i) => i !== index)
   model.value = next.length ? next : null
}

function duplicate(index: number) {
   const current = items.value[index]
   if (!current) return
   const copy = JSON.parse(JSON.stringify(current)) as Record<string, unknown>
   const next = [...items.value]
   next.splice(index + 1, 0, copy)
   model.value = next
}

function move(index: number, delta: number) {
   moveTo(index, index + delta)
}

function moveTo(from: number, to: number) {
   if (from === to || to < 0 || to >= items.value.length) return
   const next = [...items.value]
   const [item] = next.splice(from, 1)
   next.splice(to, 0, item!)
   model.value = next
}

const dragIndex = ref<number | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(index: number, event: DragEvent) {
   dragIndex.value = index
   if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
   }
}

function onDragLeave(index: number) {
   if (dropIndex.value === index) dropIndex.value = null
}

function onDrop(index: number) {
   if (dragIndex.value !== null) moveTo(dragIndex.value, index)
   onDragEnd()
}

function onDragEnd() {
   dragIndex.value = null
   dropIndex.value = null
}

const addItems = computed(() =>
   Object.entries(blocks.value).map(([type, block]) => ({
      label: block.label,
      onSelect: () => add(type),
   }))
)

const editorIndex = ref<number | null>(null)

const editorOpen = computed({
   get: () => editorIndex.value !== null,
   set: (value: boolean) => {
      if (!value) editorIndex.value = null
   },
})

const editorItem = computed(() =>
   editorIndex.value === null ? undefined : items.value[editorIndex.value]
)

const editorFields = computed(() => (editorItem.value ? blockOf(editorItem.value)?.fields : {}))

const editorTitle = computed(() => (editorItem.value ? labelOf(editorItem.value) : ''))

function openEditor(index: number) {
   editorIndex.value = index
}

function updateEditorField(key: string, value: unknown) {
   if (editorIndex.value === null) return
   updateField(editorIndex.value, key, value)
}

function removeCurrent() {
   if (editorIndex.value === null) return
   remove(editorIndex.value)
   editorIndex.value = null
}

function moveCurrent(delta: number) {
   if (editorIndex.value === null) return
   const next = editorIndex.value + delta
   move(editorIndex.value, delta)
   editorIndex.value = next
}

function duplicateCurrent() {
   if (editorIndex.value === null) return
   duplicate(editorIndex.value)
   editorIndex.value = null
}
</script>
