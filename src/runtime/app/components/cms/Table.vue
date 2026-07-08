<template>
   <table class="cms-table">
      <thead :class="ui?.thead">
         <tr>
            <th v-for="column in visibleColumns" :key="columnId(column)" :class="ui?.th">
               {{ column.header }}
            </th>
         </tr>
      </thead>
      <tbody>
         <tr
            v-for="(row, index) in data"
            :key="index"
            :class="ui?.tr"
            @click="emit('select', $event, { original: row })"
         >
            <td v-for="column in visibleColumns" :key="columnId(column)" :class="ui?.td">
               <slot :name="`${columnId(column)}-cell`" :row="{ original: row }">
                  {{ cellValue(column, row) }}
               </slot>
            </td>
         </tr>
      </tbody>
   </table>
</template>

<script setup lang="ts">
import { computed } from '#imports'

type Row = Record<string, unknown>

interface Column {
   id?: string
   accessorKey?: string
   accessorFn?: (row: Row) => unknown
   header?: string
}

const props = defineProps<{
   data: Row[]
   columns: Column[]
   ui?: { thead?: string; th?: string; td?: string; tr?: string }
}>()

const visibility = defineModel<Record<string, boolean>>('columnVisibility', { default: () => ({}) })

const emit = defineEmits<{ select: [event: Event, row: { original: Row }] }>()

function columnId(column: Column) {
   return column.id ?? column.accessorKey ?? ''
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
