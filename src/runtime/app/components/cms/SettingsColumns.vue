<template>
   <div class="cms-settings-columns">
      <p class="cms-settings-hint">
         Choose the columns of the table. Drag the visible columns to change their order.
      </p>
      <ul class="cms-settings-list">
         <li
            v-for="(key, index) in model"
            :key="key"
            class="cms-settings-item is-draggable"
            :class="{
               'is-dragging': dragging === key,
               'is-drop-before': dropIndex === index && dragging !== key,
            }"
            draggable="true"
            @dragstart="onDragStart($event, key)"
            @dragover.prevent="dropIndex = index"
            @drop.prevent="onDrop(index)"
            @dragend="onDragEnd"
         >
            <CmsIcon name="bars-2" class="cms-settings-grip size-4" />
            <CmsIcon :name="iconOf(key)" class="cms-settings-item-icon size-4" />
            <span class="cms-settings-item-label">{{ labelOf(key) }}</span>
            <CmsSwitch
               :model-value="true"
               :aria-label="`Hide ${labelOf(key)}`"
               :disabled="model.length === 1"
               @update:model-value="hide(key)"
            />
         </li>
         <li
            v-if="dragging"
            class="cms-settings-drop-end"
            :class="{ 'is-over': dropIndex === model.length }"
            @dragover.prevent="dropIndex = model.length"
            @drop.prevent="onDrop(model.length)"
         />
      </ul>

      <template v-if="hidden.length">
         <p class="cms-settings-subtitle">Hidden</p>
         <ul class="cms-settings-list">
            <li v-for="key in hidden" :key="key" class="cms-settings-item is-muted">
               <CmsIcon :name="iconOf(key)" class="cms-settings-item-icon size-4" />
               <span class="cms-settings-item-label">{{ labelOf(key) }}</span>
               <CmsSwitch
                  :model-value="false"
                  :aria-label="`Show ${labelOf(key)}`"
                  @update:model-value="show(key)"
               />
            </li>
         </ul>
      </template>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { fieldIcon } from '../../utils/ui'

const props = defineProps<{
   fields: Record<string, FieldConfig>
   extra: string[]
}>()

const model = defineModel<string[]>({ required: true })

const available = computed(() => [...Object.keys(props.fields), ...props.extra])
const hidden = computed(() => available.value.filter((key) => !model.value.includes(key)))

function labelOf(key: string) {
   return props.fields[key]?.label ?? (key === 'status' ? 'Status' : key)
}

function iconOf(key: string) {
   const field = props.fields[key]
   return field ? fieldIcon(field) : 'check-circle'
}

function hide(key: string) {
   if (model.value.length === 1) return
   model.value = model.value.filter((k) => k !== key)
}

function show(key: string) {
   model.value = [...model.value, key]
}

const dragging = ref<string | null>(null)
const dropIndex = ref<number | null>(null)

function onDragStart(event: DragEvent, key: string) {
   dragging.value = key
   event.dataTransfer?.setData('text/plain', key)
   if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(index: number) {
   const key = dragging.value
   if (key) {
      const next = model.value.filter((k) => k !== key)
      const from = model.value.indexOf(key)
      next.splice(from < index ? index - 1 : index, 0, key)
      model.value = next
   }
   onDragEnd()
}

function onDragEnd() {
   dragging.value = null
   dropIndex.value = null
}
</script>
