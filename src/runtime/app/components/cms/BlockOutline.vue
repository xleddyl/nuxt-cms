<template>
   <ol class="cms-outline" aria-label="Blocks">
      <li
         v-for="(item, index) in items"
         :key="uidFor(item)"
         class="cms-outline-row"
         :class="{
            'is-selected': index === selected,
            'is-hidden': isHiddenBlock(item),
            'is-dragging': dragIndex === index,
            'is-drop-target': dropIndex === index && dragIndex !== index,
         }"
         draggable="true"
         @dragstart="onDragStart(index, $event)"
         @dragover.prevent="dropIndex = index"
         @dragleave="dropIndex === index && (dropIndex = null)"
         @drop.prevent="onDrop(index)"
         @dragend="onDragEnd"
      >
         <span class="cms-outline-grip" aria-hidden="true">
            <CmsIcon name="bars-2" class="size-3.5" />
         </span>
         <button
            type="button"
            class="cms-outline-main"
            :aria-current="index === selected ? 'true' : undefined"
            :aria-label="`${labelOf(item)}, ${index + 1} of ${items.length}${
               isHiddenBlock(item) ? ', hidden' : ''
            }. Alt and the arrow keys move it`"
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            @click="emit('select', index)"
            @keydown.alt.up.prevent="index > 0 && emit('move', index, index - 1)"
            @keydown.alt.down.prevent="index < items.length - 1 && emit('move', index, index + 1)"
         >
            <CmsIcon :name="blockOf(item)?.icon ?? 'rectangle-stack'" class="size-4 shrink-0" />
            <span class="cms-outline-text">
               <span class="cms-outline-label">{{ labelOf(item) }}</span>
               <span v-if="summaryOf(item)" class="cms-outline-summary">
                  {{ summaryOf(item) }}
               </span>
            </span>
            <CmsIcon
               v-if="isHiddenBlock(item)"
               name="eye-slash"
               class="cms-outline-hidden size-4 shrink-0"
            />
         </button>
      </li>
   </ol>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { isHiddenBlock } from '#nuxt-cms'
import { ref } from '#imports'
import type { CmsBlockValue } from '../../../shared/preview'
import { blockSummary } from '../../../shared/preview'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{
   items: CmsBlockValue[]
   field: FieldConfig
   locale: string
   selected: number | null
}>()

const emit = defineEmits<{ select: [index: number]; move: [from: number, to: number] }>()

const { i18n } = useCmsRuntime()

let uidCounter = 0
const uids = new WeakMap<CmsBlockValue, number>()

function uidFor(item: CmsBlockValue) {
   let uid = uids.get(item)
   if (uid === undefined) {
      uid = ++uidCounter
      uids.set(item, uid)
   }
   return uid
}

function blockOf(item: CmsBlockValue) {
   return props.field.blocks?.[String(item.type)]
}

function labelOf(item: CmsBlockValue) {
   return blockOf(item)?.label ?? String(item.type)
}

function summaryOf(item: CmsBlockValue) {
   return blockSummary(blockOf(item), item, props.locale, i18n.defaultLocale, 60)
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

function onDrop(index: number) {
   if (dragIndex.value !== null && dragIndex.value !== index) emit('move', dragIndex.value, index)
   onDragEnd()
}

function onDragEnd() {
   dragIndex.value = null
   dropIndex.value = null
}
</script>
