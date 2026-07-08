<template>
   <CmsTranslatableField v-if="isTranslatableField(field)" v-model="translatable" :field="field" />
   <CmsBlocksField v-else-if="field.type === 'blocks'" v-model="blocksValue" :field="field" />
   <CmsRichTextField v-else-if="field.type === 'richtext'" v-model="strOrNull" />
   <CmsTextarea
      v-else-if="field.type === 'text' && field.textarea"
      v-model="str"
      :rows="4"
      size="lg"
      class="w-full"
   />
   <CmsInput v-else-if="field.type === 'text'" v-model="str" size="lg" class="w-full" />
   <CmsInput
      v-else-if="field.type === 'email'"
      v-model="str"
      type="email"
      size="lg"
      class="w-full"
   />
   <CmsSlugField v-else-if="field.type === 'slug'" v-model="strOrNull" :source="slugSource" />
   <CmsSelect
      v-else-if="field.type === 'select'"
      v-model="sel"
      :items="field.options"
      :required="field.required"
      size="lg"
      class="w-full"
   />
   <CmsSwitch
      v-else-if="field.type === 'boolean'"
      :model-value="!!model"
      @update:model-value="
         (v) => {
            model = !!v
         }
      "
   />
   <CmsJsonField v-else-if="field.type === 'json'" v-model="jsonValue" />
   <CmsInput
      v-else-if="field.type === 'number'"
      v-model.number="num"
      type="number"
      size="lg"
      class="w-full"
   />
   <CmsInput v-else-if="field.type === 'date'" v-model="str" type="date" size="lg" class="w-full" />
   <CmsRelationField
      v-else-if="field.type === 'relation'"
      v-model="relationValue"
      :to="field.to!"
      :required="field.required"
      :multiple="field.cardinality === 'many-to-many'"
   />
   <CmsMediaField v-else v-model="strOrNull" :media-type="field.mediaType" :accept="field.accept" />
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import { computed } from '#imports'

defineProps<{
   field: FieldConfig
   slugSource?: string | null
}>()

const model = defineModel<unknown>({ required: true })

function proxy<T>(fromModel: (v: unknown) => T, toModel: (v: T) => unknown = (v) => v) {
   return computed<T>({
      get: () => fromModel(model.value),
      set: (value) => {
         model.value = toModel(value)
      },
   })
}

const str = proxy<string>(
   (v) => (v as string | null) ?? '',
   (v) => (v === '' ? null : v)
)
const strOrNull = proxy<string | null>((v) => v as string | null)
const sel = proxy<string | undefined>(
   (v) => (v as string | null) ?? undefined,
   (v) => v ?? null
)
const num = proxy<number | undefined>(
   (v) => (v as number | null) ?? undefined,
   (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)
)
const translatable = proxy<Record<string, string> | null>((v) => v as Record<string, string> | null)
const blocksValue = proxy<Record<string, unknown>[] | null>(
   (v) => v as Record<string, unknown>[] | null
)
const relationValue = proxy<string | string[] | null>((v) => v as string | string[] | null)
const jsonValue = proxy<unknown>((v) => v)
</script>
