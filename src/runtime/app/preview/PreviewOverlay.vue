<template>
   <div ref="root" class="cms-preview-overlay" :class="{ 'is-dragging': drag?.moved }">
      <template v-for="box in boxes" :key="box.index">
         <div
            v-if="box.index === hovered || box.index === selected"
            class="cms-preview-outline"
            :class="{ 'is-selected': box.index === selected }"
            :style="outlineStyle(box)"
         >
            <span class="cms-preview-label">{{ labelOf(box) }}</span>
         </div>
         <div
            v-if="box.index === hovered || box.index === selected"
            class="cms-preview-toolbar"
            :class="{ 'is-selected': box.index === selected }"
            :style="toolbarStyle(box)"
            role="toolbar"
            :aria-label="`${labelOf(box)} block`"
         >
            <button
               type="button"
               class="cms-preview-tool cms-preview-handle"
               :aria-label="`Move ${labelOf(box)}: drag, or use the up and down arrow keys`"
               title="Drag to reorder"
               @pointerdown="startDrag($event, box.index)"
               @keydown="onHandleKey($event, box.index)"
               @click="onHandleClick(box.index)"
            >
               <CmsIcon name="bars-2" />
            </button>
            <button
               type="button"
               class="cms-preview-tool"
               aria-label="Move up"
               title="Move up"
               :disabled="box.index === 0"
               @click="emitMove(box.index, box.index - 1)"
            >
               <CmsIcon name="arrow-up" />
            </button>
            <button
               type="button"
               class="cms-preview-tool"
               aria-label="Move down"
               title="Move down"
               :disabled="box.index >= total - 1"
               @click="emitMove(box.index, box.index + 1)"
            >
               <CmsIcon name="arrow-down" />
            </button>
            <span class="cms-preview-separator" />
            <button
               type="button"
               class="cms-preview-tool"
               aria-label="Duplicate"
               title="Duplicate"
               @click="emit('message', { type: 'duplicate', index: box.index })"
            >
               <CmsIcon name="document-duplicate" />
            </button>
            <button
               v-if="hideable(box)"
               type="button"
               class="cms-preview-tool"
               aria-label="Hide"
               title="Hide"
               @click="emit('message', { type: 'toggle-hidden', index: box.index })"
            >
               <CmsIcon name="eye-slash" />
            </button>
            <button
               type="button"
               class="cms-preview-tool is-danger"
               aria-label="Delete"
               title="Delete"
               @click="emit('message', { type: 'remove', index: box.index })"
            >
               <CmsIcon name="trash" />
            </button>
         </div>
      </template>

      <button
         v-for="slot in insertSlots"
         :key="`insert-${slot.index}-${slot.edge}`"
         type="button"
         class="cms-preview-insert"
         :class="{ 'is-near': slot.near }"
         :style="{ top: `${slot.y}px`, left: `${slot.x}px` }"
         :aria-label="`Insert a block at position ${slot.index + 1}`"
         title="Insert a block"
         @click="emit('message', { type: 'insert', index: slot.index })"
      >
         <CmsIcon name="plus" />
      </button>

      <div
         v-if="drag?.moved && dropY !== null"
         class="cms-preview-dropline"
         :style="{ top: `${dropY}px`, left: `${dropLeft}px`, width: `${dropWidth}px` }"
      />
   </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from '#imports'
import type { FieldConfig } from '../../shared/index'
import type { CmsPreviewFrameMessage } from '../../shared/preview'
import { canHideBlock, insertionIndex, moveTargetForInsertion } from '../../shared/preview'

interface Box {
   index: number
   type: string
   top: number
   left: number
   width: number
   height: number
   bottom: number
}

const props = defineProps<{
   field: FieldConfig
   total: number
   selected: number | null
   version: number
}>()

const emit = defineEmits<{ message: [message: CmsPreviewFrameMessage] }>()

const root = ref<HTMLElement | null>(null)
const boxes = ref<Box[]>([])
const hovered = ref<number | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)

const drag = ref<{ from: number; startY: number; y: number; moved: boolean } | null>(null)
let refocus = false
let suppressClick = false
let frame = 0

function labelOf(box: Box) {
   return props.field.blocks?.[box.type]?.label ?? box.type
}

function hideable(box: Box) {
   return canHideBlock(props.field.blocks?.[box.type])
}

function measure() {
   frame = 0
   viewportWidth.value = window.innerWidth
   viewportHeight.value = window.innerHeight
   const found: Box[] = []
   for (const element of document.querySelectorAll<HTMLElement>('[data-cms-block]')) {
      const index = Number(element.dataset.cmsBlock)
      if (!Number.isInteger(index)) continue
      const rect = element.getBoundingClientRect()
      found.push({
         index,
         type: element.dataset.cmsBlockType ?? '',
         top: rect.top,
         left: rect.left,
         width: rect.width,
         height: rect.height,
         bottom: rect.bottom,
      })
   }
   boxes.value = found.sort((a, b) => a.top - b.top)
}

function scheduleMeasure() {
   if (!frame) frame = requestAnimationFrame(measure)
}

function outlineStyle(box: Box) {
   return {
      top: `${box.top}px`,
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
   }
}

function toolbarStyle(box: Box) {
   const top = Math.min(Math.max(box.top + 8, 8), Math.max(box.bottom - 44, 8))
   const right = Math.min(box.left + box.width, viewportWidth.value) - 8
   return { top: `${top}px`, left: `${right}px` }
}

const INSERT_MARGIN = 14

const insertSlots = computed(() => {
   const list = boxes.value
   const near = new Set([hovered.value, props.selected])
   const maxY = viewportHeight.value - INSERT_MARGIN
   const clampY = (y: number) => Math.min(Math.max(y, INSERT_MARGIN), Math.max(maxY, INSERT_MARGIN))
   return list.flatMap((box, position) => {
      const next = list[position + 1]
      const x = box.left + box.width / 2
      const after = {
         index: box.index + 1,
         edge: 'after',
         y: clampY(next ? (box.bottom + next.top) / 2 : box.bottom),
         x,
         near: near.has(box.index) || (!!next && near.has(next.index)),
      }
      if (position > 0) return [after]
      const before = {
         index: box.index,
         edge: 'before',
         y: clampY(box.top),
         x,
         near: near.has(box.index),
      }
      return [before, after]
   })
})

const dropIndex = computed(() =>
   drag.value ? insertionIndex(boxes.value, drag.value.y, props.total) : null
)

const dropY = computed(() => {
   if (dropIndex.value === null) return null
   const list = boxes.value
   const position = list.findIndex((box) => box.index >= dropIndex.value!)
   if (position === -1) return list.at(-1)?.bottom ?? null
   const previous = list[position - 1]
   return previous ? (previous.bottom + list[position]!.top) / 2 : list[position]!.top
})

const dropLeft = computed(() => boxes.value[0]?.left ?? 0)
const dropWidth = computed(() => boxes.value[0]?.width ?? viewportWidth.value)

function emitMove(from: number, to: number, focus = false) {
   if (to < 0 || to >= props.total || from === to) return
   emit('message', focus ? { type: 'move', from, to, focus: true } : { type: 'move', from, to })
}

function onHandleKey(event: KeyboardEvent, index: number) {
   if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
   event.preventDefault()
   refocus = true
   emitMove(index, event.key === 'ArrowUp' ? index - 1 : index + 1, true)
}

function onHandleClick(index: number) {
   if (drag.value?.moved) return
   emit('message', { type: 'select', index })
}

function startDrag(event: PointerEvent, index: number) {
   if (event.button !== 0) return
   drag.value = { from: index, startY: event.clientY, y: event.clientY, moved: false }
   window.addEventListener('pointermove', onDragMove)
   window.addEventListener('pointerup', onDragEnd)
   window.addEventListener('pointercancel', cancelDrag)
}

function onDragMove(event: PointerEvent) {
   const current = drag.value
   if (!current) return
   current.y = event.clientY
   if (!current.moved && Math.abs(event.clientY - current.startY) > 4) {
      current.moved = true
      document.documentElement.classList.add('cms-preview-grabbing')
   }
   if (current.moved) {
      event.preventDefault()
      const edge = 48
      if (event.clientY < edge) window.scrollBy(0, -12)
      else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12)
   }
}

function stopDrag() {
   window.removeEventListener('pointermove', onDragMove)
   window.removeEventListener('pointerup', onDragEnd)
   window.removeEventListener('pointercancel', cancelDrag)
   document.documentElement.classList.remove('cms-preview-grabbing')
}

function onDragEnd() {
   const current = drag.value
   stopDrag()
   if (current?.moved && dropIndex.value !== null) {
      suppressClick = true
      emitMove(current.from, moveTargetForInsertion(current.from, dropIndex.value))
   }
   setTimeout(() => {
      drag.value = null
      suppressClick = false
   })
}

function cancelDrag() {
   stopDrag()
   drag.value = null
}

function blockIndexOf(target: EventTarget | null): number | null {
   const element =
      target instanceof Element ? target.closest<HTMLElement>('[data-cms-block]') : null
   const index = element ? Number(element.dataset.cmsBlock) : NaN
   return Number.isInteger(index) ? index : null
}

function insideOverlay(target: EventTarget | null) {
   return target instanceof Node && !!root.value?.contains(target)
}

function onPointerMove(event: PointerEvent) {
   if (drag.value || insideOverlay(event.target)) return
   hovered.value = blockIndexOf(event.target)
}

function onPointerLeave() {
   if (!drag.value) hovered.value = null
}

function onClick(event: MouseEvent) {
   if (suppressClick) {
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
      return
   }
   if (insideOverlay(event.target)) return
   const target = event.target instanceof Element ? event.target : null
   if (target?.closest('a, button, input, select, textarea, label, summary')) event.preventDefault()
   if (target?.closest('[data-cms-preview-keep]')) return
   event.stopPropagation()
   emit('message', { type: 'select', index: blockIndexOf(event.target) })
}

function onSubmit(event: Event) {
   event.preventDefault()
}

function onKeydown(event: KeyboardEvent) {
   if (event.key === 'Escape' && props.selected !== null) {
      emit('message', { type: 'select', index: null })
   }
}

function revealSelected() {
   if (props.selected === null || drag.value) return
   const element = document.querySelector<HTMLElement>(`[data-cms-block="${props.selected}"]`)
   if (!element) return
   const rect = element.getBoundingClientRect()
   if (rect.bottom < 0 || rect.top > window.innerHeight) {
      element.scrollIntoView({ block: 'center', behavior: 'smooth' })
   }
}

watch(
   () => props.version,
   async () => {
      await nextTick()
      measure()
      if (refocus) {
         refocus = false
         root.value
            ?.querySelector<HTMLElement>('.cms-preview-toolbar.is-selected .cms-preview-handle')
            ?.focus()
      }
   }
)

watch(
   () => props.selected,
   async () => {
      await nextTick()
      revealSelected()
   }
)

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

onMounted(() => {
   measure()
   document.addEventListener('pointermove', onPointerMove, { passive: true })
   document.documentElement.addEventListener('pointerleave', onPointerLeave)
   document.addEventListener('click', onClick, true)
   document.addEventListener('submit', onSubmit, true)
   document.addEventListener('keydown', onKeydown)
   document.addEventListener('load', scheduleMeasure, true)
   window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true })
   window.addEventListener('resize', scheduleMeasure)
   resizeObserver = new ResizeObserver(scheduleMeasure)
   resizeObserver.observe(document.body)
   mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !root.value?.contains(record.target))) scheduleMeasure()
   })
   mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true })
})

onBeforeUnmount(() => {
   stopDrag()
   if (frame) cancelAnimationFrame(frame)
   document.removeEventListener('pointermove', onPointerMove)
   document.documentElement.removeEventListener('pointerleave', onPointerLeave)
   document.removeEventListener('click', onClick, true)
   document.removeEventListener('submit', onSubmit, true)
   document.removeEventListener('keydown', onKeydown)
   document.removeEventListener('load', scheduleMeasure, true)
   window.removeEventListener('scroll', scheduleMeasure, { capture: true })
   window.removeEventListener('resize', scheduleMeasure)
   resizeObserver?.disconnect()
   mutationObserver?.disconnect()
})
</script>
