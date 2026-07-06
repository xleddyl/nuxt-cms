<template>
   <USelectMenu
      v-if="multiple"
      v-model="many"
      multiple
      :items="options"
      value-key="value"
      :loading="loading"
      size="lg"
      class="w-full"
   />
   <USelectMenu
      v-else
      v-model="single"
      :items="singleItems"
      value-key="value"
      :loading="loading"
      size="lg"
      class="w-full"
   />
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import { computed, onMounted, ref, useI18n, useToast } from '#imports'
import cmsConfig from '#cms-config'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { errorMessage } from '../../utils/ui'

const props = defineProps<{
   to: string
   required?: boolean
   multiple?: boolean
}>()

const model = defineModel<string | string[] | null>({ required: true })

const { t } = useI18n()
const toast = useToast()

const target = (cmsConfig as CmsConfig)[props.to]
const rows = ref<Record<string, unknown>[]>([])
const loading = ref(true)

onMounted(async () => {
   try {
      rows.value = await $fetch<Record<string, unknown>[]>(`/api/cms/admin/${props.to}`)
   } catch (err) {
      toast.add({
         title: t('cms.toast.loadFailed'),
         description: errorMessage(err),
         color: 'error',
      })
   } finally {
      loading.value = false
   }
})

const { i18n: contentI18n } = useCmsRuntime()

const titleField = target?.titleField ?? 'id'
const titleFieldConfig = target?.fields[titleField]

function optionLabel(row: Record<string, unknown>): string {
   const value = row[titleField]
   if (value != null && titleFieldConfig && isTranslatableField(titleFieldConfig)) {
      const record = value as Record<string, string>
      const raw = record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
      return raw || `#${row.id}`
   }
   return String(value ?? `#${row.id}`)
}

const options = computed(() =>
   rows.value.map((row) => ({
      label: optionLabel(row),
      value: row.id as string,
   }))
)

const singleItems = computed(() => [
   ...(props.required ? [] : [{ label: '—', value: null }]),
   ...options.value,
])

const single = computed({
   get: () => (model.value ?? null) as string | null,
   set: (value: string | null) => {
      model.value = value
   },
})

const many = computed({
   get: () => (model.value as string[] | null) ?? [],
   set: (value: string[]) => {
      model.value = value
   },
})
</script>
