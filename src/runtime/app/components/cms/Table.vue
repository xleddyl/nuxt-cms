<template>
   <div class="cms-card cms-table-shell">
      <div class="cms-table-scroll">
         <table class="cms-table">
            <thead>
               <tr>
                  <th
                     v-for="column in visibleColumns"
                     :key="columnId(column)"
                     :class="{
                        'is-dragging': draggingId === columnId(column),
                        'is-drop-target': dropTargetId === columnId(column),
                        'is-sortable': column.sortable,
                        'is-sorted': sort?.key === columnId(column),
                     }"
                     :draggable="column.reorderable || undefined"
                     :aria-sort="ariaSort(column)"
                     @click="toggleSort(column)"
                     @dragstart="onDragStart($event, column)"
                     @dragover="onDragOver($event, column)"
                     @dragleave="onDragLeave(column)"
                     @drop="onDrop($event, column)"
                     @dragend="resetDrag"
                  >
                     <span class="cms-th-label">
                        {{ column.header }}
                        <CmsIcon
                           v-if="column.sortable"
                           :name="sortIcon(column)"
                           class="cms-th-sort size-3"
                        />
                     </span>
                  </th>
               </tr>
            </thead>
            <tbody>
               <tr
                  v-for="(row, index) in data"
                  :key="index"
                  class="__clickable"
                  @click="emit('select', $event, { original: row })"
               >
                  <td v-for="column in visibleColumns" :key="columnId(column)">
                     <slot :name="`${columnId(column)}-cell`" :row="{ original: row }">
                        {{ cellValue(column, row) }}
                     </slot>
                  </td>
               </tr>
            </tbody>
         </table>
      </div>
   </div>
</template>

<script setup lang="ts">
import { computed, ref } from '#imports'

type Row = Record<string, unknown>

interface Column {
   id?: string
   accessorKey?: string
   accessorFn?: (row: Row) => unknown
   header?: string
   reorderable?: boolean
   sortable?: boolean
}

interface TableSort {
   key: string
   order: 'asc' | 'desc'
}

const props = defineProps<{
   data: Row[]
   columns: Column[]
}>()

const visibility = defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })

const sort = defineModel<TableSort | null>('sort', { default: null })

const emit = defineEmits<{
   select: [event: Event, row: { original: Row }]
   reorder: [from: string, to: string]
}>()

function columnId(column: Column) {
   return column.id ?? column.accessorKey ?? ''
}

function toggleSort(column: Column) {
   if (!column.sortable) return
   const key = columnId(column)
   if (sort.value?.key !== key) sort.value = { key, order: 'asc' }
   else if (sort.value.order === 'asc') sort.value = { key, order: 'desc' }
   else sort.value = null
}

function sortIcon(column: Column) {
   if (sort.value?.key !== columnId(column)) return 'arrows-up-down'
   return sort.value.order === 'asc' ? 'arrow-small-up' : 'arrow-small-down'
}

function ariaSort(column: Column) {
   if (!column.sortable) return undefined
   if (sort.value?.key !== columnId(column)) return 'none'
   return sort.value.order === 'asc' ? 'ascending' : 'descending'
}

const draggingId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)

function resetDrag() {
   draggingId.value = null
   dropTargetId.value = null
}

function onDragStart(event: DragEvent, column: Column) {
   if (!column.reorderable) return
   draggingId.value = columnId(column)
   event.dataTransfer?.setData('text/plain', columnId(column))
   if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event: DragEvent, column: Column) {
   if (!draggingId.value || !column.reorderable) return
   event.preventDefault()
   if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
   dropTargetId.value = columnId(column)
}

function onDragLeave(column: Column) {
   if (dropTargetId.value === columnId(column)) dropTargetId.value = null
}

function onDrop(event: DragEvent, column: Column) {
   if (!draggingId.value || !column.reorderable) return
   event.preventDefault()
   const from = draggingId.value
   const to = columnId(column)
   resetDrag()
   if (from !== to) emit('reorder', from, to)
}

const visibleColumns = computed(() =>
   props.columns.filter((column) => visibility.value[columnId(column)] !== false)
)

function cellValue(column: Column, row: Row) {
   if (column.accessorFn) return column.accessorFn(row)
   if (column.accessorKey) return row[column.accessorKey]
   return ''
}
</script>
