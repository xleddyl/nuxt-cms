<template>
   <div class="flex flex-col gap-3">
      <div
         v-for="(item, index) in items"
         :key="uidFor(item)"
         class="cms-card flex flex-col gap-4 p-4"
      >
         <div class="flex items-center gap-1">
            <button
               type="button"
               class="cms-kicker flex grow items-center gap-1.5 text-left"
               :aria-label="
                  isCollapsed(item) ? t('cms.form.expandBlock') : t('cms.form.collapseBlock')
               "
               @click="toggleCollapsed(item)"
            >
               <UIcon
                  :name="isCollapsed(item) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                  class="size-3.5"
               />
               {{ blocks[item.type as string]?.label ?? item.type }}
            </button>
            <UButton
               icon="i-lucide-chevron-up"
               size="xs"
               variant="ghost"
               color="neutral"
               :aria-label="t('cms.form.moveUp')"
               :disabled="index === 0"
               @click="move(index, -1)"
            />
            <UButton
               icon="i-lucide-chevron-down"
               size="xs"
               variant="ghost"
               color="neutral"
               :aria-label="t('cms.form.moveDown')"
               :disabled="index === items.length - 1"
               @click="move(index, 1)"
            />
            <UButton
               icon="i-lucide-copy"
               size="xs"
               variant="ghost"
               color="neutral"
               :aria-label="t('cms.form.duplicateBlock')"
               @click="duplicate(index)"
            />
            <UButton
               icon="i-lucide-trash-2"
               size="xs"
               variant="ghost"
               color="error"
               :aria-label="t('cms.form.removeBlock')"
               @click="remove(index)"
            />
         </div>
         <template v-if="!isCollapsed(item)">
            <UFormField
               v-for="(blockField, blockKey) in blocks[item.type as string]?.fields"
               :key="blockKey"
               :label="blockField.label"
               :required="blockField.required"
               :ui="CMS_FIELD_UI"
            >
               <CmsFieldInput
                  :model-value="item[blockKey]"
                  :field="blockField"
                  @update:model-value="(value: unknown) => updateField(index, blockKey, value)"
               />
            </UFormField>
         </template>
      </div>
      <UDropdownMenu :items="addItems">
         <UButton
            :label="t('cms.form.addBlock')"
            icon="i-lucide-plus"
            variant="subtle"
            class="self-start rounded-full px-4"
         />
      </UDropdownMenu>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { computed, ref, useI18n } from '#imports'
import { CMS_FIELD_UI } from '../../utils/ui'

const props = defineProps<{ field: FieldConfig }>()

const model = defineModel<Record<string, unknown>[] | null>({ required: true })

const { t } = useI18n()

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

const collapsedUids = ref(new Set<number>())

function isCollapsed(item: Record<string, unknown>) {
   return collapsedUids.value.has(uidFor(item))
}

function toggleCollapsed(item: Record<string, unknown>) {
   const uid = uidFor(item)
   const next = new Set(collapsedUids.value)
   if (next.has(uid)) next.delete(uid)
   else next.add(uid)
   collapsedUids.value = next
}

function move(index: number, delta: number) {
   const next = [...items.value]
   const [item] = next.splice(index, 1)
   next.splice(index + delta, 0, item!)
   model.value = next
}

const addItems = computed(() =>
   Object.entries(blocks.value).map(([type, block]) => ({
      label: block.label,
      onSelect: () => add(type),
   }))
)
</script>
