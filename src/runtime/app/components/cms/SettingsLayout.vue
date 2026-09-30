<template>
   <div class="cms-layout-editor" :class="{ 'is-dragging': dragging }">
      <p class="cms-settings-hint">
         Drag a field up or down to move it. Drop it on the side of another field to put them in the
         same row (up to {{ MAX_LAYOUT_ROW_FIELDS }}).
      </p>
      <div class="cms-layout-areas">
         <div v-for="area in AREAS" :key="area.id" class="cms-layout-area" :class="`is-${area.id}`">
            <div
               v-if="!model[area.id].some((section) => section.rows.length || section.title)"
               class="cms-layout-empty"
               :class="{ 'is-over': isOver({ type: 'area', area: area.id }) }"
               @dragover.prevent="setTarget({ type: 'area', area: area.id })"
               @drop.prevent="drop"
            >
               {{ area.empty }}
            </div>
            <div
               v-for="(section, sectionIndex) in model[area.id]"
               v-else
               :key="`${area.id}-${sectionIndex}`"
               class="cms-layout-section"
               :class="{ 'is-titled': !!section.title }"
            >
               <p v-if="section.title" class="cms-layout-section-title">
                  {{ section.title }}
                  <span v-if="section.collapsed" class="cms-badge is-muted">Collapsed</span>
               </p>
               <template v-for="(row, rowIndex) in section.rows" :key="row.join('|')">
                  <div
                     class="cms-layout-gap"
                     :class="{ 'is-over': isOver(gapTarget(area.id, sectionIndex, rowIndex)) }"
                     @dragover.prevent="setTarget(gapTarget(area.id, sectionIndex, rowIndex))"
                     @drop.prevent="drop"
                  />
                  <div class="cms-layout-row">
                     <div
                        v-for="key in row"
                        :key="key"
                        class="cms-layout-chip"
                        :class="{
                           'is-dragging': dragging === key,
                           'is-drop-before': isOver({ type: 'inline', key, after: false }),
                           'is-drop-after': isOver({ type: 'inline', key, after: true }),
                           'is-blocked': blocked === key,
                        }"
                        draggable="true"
                        @dragstart="onDragStart($event, key)"
                        @dragover.prevent="onChipOver($event, key, row)"
                        @drop.prevent="drop"
                        @dragend="onDragEnd"
                     >
                        <CmsIcon name="bars-2" class="cms-settings-grip size-3.5" />
                        <CmsIcon :name="iconOf(key)" class="cms-settings-item-icon size-3.5" />
                        <span class="cms-layout-chip-label">{{ fields[key]?.label ?? key }}</span>
                        <span v-if="tabLabel(key)" class="cms-layout-chip-tab">{{
                           tabLabel(key)
                        }}</span>
                     </div>
                  </div>
               </template>
               <div
                  class="cms-layout-gap is-end"
                  :class="{
                     'is-over': isOver(gapTarget(area.id, sectionIndex, section.rows.length)),
                     'is-empty': !section.rows.length,
                  }"
                  @dragover.prevent="
                     setTarget(gapTarget(area.id, sectionIndex, section.rows.length))
                  "
                  @drop.prevent="drop"
               >
                  <span v-if="!section.rows.length">Drop fields here</span>
               </div>
            </div>
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import type { CmsFormLayout, CmsLayoutSection, CmsTab, FieldConfig } from '#nuxt-cms'
import { MAX_LAYOUT_ROW_FIELDS, fieldTab } from '#nuxt-cms'
import { ref } from '#imports'
import { fieldIcon } from '../../utils/ui'

type Area = 'main'

type DropTarget =
   | { type: 'area'; area: Area }
   | { type: 'gap'; area: Area; section: number; row: number }
   | { type: 'inline'; key: string; after: boolean }

const AREAS: { id: Area; empty: string }[] = [{ id: 'main', empty: 'Drop fields here' }]

const props = defineProps<{
   fields: Record<string, FieldConfig>
   tabs?: CmsTab[]
}>()

const model = defineModel<CmsFormLayout>({ required: true })

const dragging = ref<string | null>(null)
const target = ref<DropTarget | null>(null)
const blocked = ref<string | null>(null)

function iconOf(key: string) {
   const field = props.fields[key]
   return field ? fieldIcon(field) : 'bars-3-bottom-left'
}

function tabLabel(key: string) {
   const field = props.fields[key]
   if (!field || !props.tabs?.length) return ''
   const id = fieldTab(field, props.tabs)
   return props.tabs.find((tab) => tab.id === id)?.label ?? ''
}

function gapTarget(area: Area, section: number, row: number): DropTarget {
   return { type: 'gap', area, section, row }
}

function sameTarget(a: DropTarget | null, b: DropTarget) {
   return !!a && JSON.stringify(a) === JSON.stringify(b)
}

function isOver(candidate: DropTarget) {
   return sameTarget(target.value, candidate)
}

function setTarget(candidate: DropTarget) {
   blocked.value = null
   if (!sameTarget(target.value, candidate)) target.value = candidate
}

function onDragStart(event: DragEvent, key: string) {
   dragging.value = key
   event.dataTransfer?.setData('text/plain', key)
   if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onChipOver(event: DragEvent, key: string, row: string[]) {
   if (!dragging.value || key === dragging.value) {
      target.value = null
      return
   }
   const full = row.length >= MAX_LAYOUT_ROW_FIELDS && !row.includes(dragging.value)
   if (full) {
      target.value = null
      blocked.value = key
      return
   }
   const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
   setTarget({ type: 'inline', key, after: event.clientX > box.left + box.width / 2 })
}

function onDragEnd() {
   dragging.value = null
   target.value = null
   blocked.value = null
}

function cloneLayout(layout: CmsFormLayout): CmsFormLayout {
   const copy = (sections: CmsLayoutSection[]) =>
      sections.map((section) => ({ ...section, rows: section.rows.map((row) => [...row]) }))
   return { main: copy(layout.main) }
}

function drop() {
   const key = dragging.value
   const to = target.value
   onDragEnd()
   if (!key || !to) return

   const next = cloneLayout(model.value)
   const sections = next.main
   const anchorRow = to.type === 'gap' ? next[to.area][to.section]?.rows[to.row] ?? null : null

   for (const section of sections) {
      for (const row of section.rows) {
         const index = row.indexOf(key)
         if (index !== -1) row.splice(index, 1)
      }
   }

   if (to.type === 'inline') {
      const row = sections.flatMap((section) => section.rows).find((r) => r.includes(to.key))
      if (!row) return
      row.splice(row.indexOf(to.key) + (to.after ? 1 : 0), 0, key)
   } else if (to.type === 'gap') {
      const section = next[to.area][to.section]
      if (!section) return
      const index = anchorRow ? section.rows.indexOf(anchorRow) : section.rows.length
      section.rows.splice(index === -1 ? section.rows.length : index, 0, [key])
   } else {
      next[to.area] = [...next[to.area].filter((s) => s.title), { rows: [[key]] }]
   }

   for (const section of sections) {
      section.rows = section.rows.filter((row) => row.length)
   }
   next.main = next.main.filter((section) => section.title || section.rows.length)
   model.value = next
}
</script>
