<template>
   <div class="cms-card cms-table-shell">
      <div class="cms-table-scroll">
         <table class="cms-table">
            <thead>
               <tr>
                  <th v-if="selectable" class="cms-table-check-cell">
                     <CmsCheckbox
                        :checked="allSelected"
                        :indeterminate="someSelected"
                        aria-label="Select all rows"
                        @toggle="toggleAll"
                     />
                  </th>
                  <th
                     v-for="column in columns"
                     :key="columnId(column)"
                     :class="{
                        'is-sortable': column.sortable,
                        'is-sorted': sort?.key === columnId(column),
                     }"
                     :aria-sort="ariaSort(column)"
                     @click="toggleSort(column)"
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
                  :key="keyOf(row)"
                  class="__clickable"
                  :class="{ 'is-selected': isSelected(row) }"
                  :style="{ '--cms-row-delay': `${Math.min(index, 14) * 24}ms` }"
                  @click="emit('select', $event, { original: row })"
               >
                  <td v-if="selectable" class="cms-table-check-cell" @click.stop="toggleRow(row)">
                     <CmsCheckbox
                        :checked="isSelected(row)"
                        aria-label="Select row"
                        @toggle="toggleRow(row)"
                     />
                  </td>
                  <td v-for="column in columns" :key="columnId(column)">
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
import { computed } from '#imports'

type Row = Record<string, unknown>

interface Column {
   id?: string
   accessorKey?: string
   accessorFn?: (row: Row) => unknown
   header?: string
   sortable?: boolean
}

interface TableSort {
   key: string
   order: 'asc' | 'desc'
}

const props = defineProps<{
   data: Row[]
   columns: Column[]
   selectable?: boolean
}>()

const selected = defineModel<string[]>('selected', { default: () => [] })

function keyOf(row: Row) {
   return String(row.id)
}

function isSelected(row: Row) {
   return selected.value.includes(keyOf(row))
}

function toggleRow(row: Row) {
   const key = keyOf(row)
   selected.value = isSelected(row)
      ? selected.value.filter((k) => k !== key)
      : [...selected.value, key]
}

const allSelected = computed(
   () => props.data.length > 0 && props.data.every((row) => isSelected(row))
)

const someSelected = computed(() => !allSelected.value && selected.value.length > 0)

function toggleAll() {
   selected.value = allSelected.value ? [] : props.data.map(keyOf)
}

const sort = defineModel<TableSort | null>('sort', { default: null })

const emit = defineEmits<{
   select: [event: Event, row: { original: Row }]
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

function cellValue(column: Column, row: Row) {
   if (column.accessorFn) return column.accessorFn(row)
   if (column.accessorKey) return row[column.accessorKey]
   return ''
}
</script>
