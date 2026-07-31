<template>
   <CmsRichTextField v-if="props.field.type === 'richtext'" v-model="current" />
   <CmsTextarea v-else-if="props.field.textarea" v-model="current" :rows="8" />
   <CmsInput v-else v-model="current" />
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { computed } from '#imports'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ field: FieldConfig; locale?: string }>()

const model = defineModel<Record<string, string> | null>({ required: true })

const { i18n } = useCmsRuntime()

const active = computed(() => props.locale ?? i18n.defaultLocale)

const current = computed({
   get: () => model.value?.[active.value] ?? '',
   set: (value: string | null) => {
      const next = Object.fromEntries(
         Object.entries(model.value ?? {}).filter(([locale]) => locale !== active.value)
      )
      if (value != null && value !== '') next[active.value] = value
      model.value = Object.keys(next).length ? next : null
   },
})
</script>
