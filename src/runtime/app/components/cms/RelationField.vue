<template>
   <USelectMenu
      v-if="multiple"
      v-model="many"
      v-model:search-term="searchTerm"
      multiple
      ignore-filter
      :items="options"
      value-key="value"
      :loading="loading"
      size="lg"
      class="w-full"
   />
   <USelectMenu
      v-else
      v-model="single"
      v-model:search-term="searchTerm"
      ignore-filter
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
import { computed, onMounted, ref, useI18n, useToast, watch } from '#imports'
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

type Row = Record<string, unknown>

const target = (cmsConfig as CmsConfig)[props.to]
const endpoint = `/api/cms/admin/${props.to}`
const fetched = ref<Row[]>([])
const selectedRows = ref(new Map<string, Row>())
const loading = ref(true)
const searchTerm = ref('')

async function fetchOptions() {
   loading.value = true
   try {
      const term = searchTerm.value.trim()
      const page = await $fetch<{ items: Row[] }>(endpoint, {
         query: { light: 'true', limit: 25, ...(term ? { search: term } : {}) },
      })
      fetched.value = page.items
   } catch (err) {
      toast.add({
         title: t('cms.toast.loadFailed'),
         description: errorMessage(err),
         color: 'error',
      })
   } finally {
      loading.value = false
   }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchTerm, () => {
   clearTimeout(searchTimer)
   searchTimer = setTimeout(() => void fetchOptions(), 300)
})

const selectedIds = computed<string[]>(() => {
   if (props.multiple) return (model.value as string[] | null) ?? []
   return model.value ? [model.value as string] : []
})

async function resolveSelected() {
   const missing = selectedIds.value.filter((id) => !selectedRows.value.has(id))
   await Promise.all(
      missing.map(async (id) => {
         try {
            const row = await $fetch<Row>(`${endpoint}/${id}`)
            selectedRows.value.set(id, row)
         } catch {}
      })
   )
}

onMounted(() => {
   void fetchOptions()
   void resolveSelected()
})

const { i18n: contentI18n } = useCmsRuntime()

const titleField = target?.titleField ?? 'id'
const titleFieldConfig = target?.fields[titleField]

function optionLabel(row: Row): string {
   const value = row[titleField]
   if (value != null && titleFieldConfig && isTranslatableField(titleFieldConfig)) {
      const record = value as Record<string, string>
      const raw = record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
      return raw || `#${row.id}`
   }
   return String(value ?? `#${row.id}`)
}

const options = computed(() => {
   const seen = new Set<string>()
   const list: { label: string; value: string }[] = []
   for (const row of fetched.value) {
      const id = row.id as string
      list.push({ label: optionLabel(row), value: id })
      seen.add(id)
   }
   for (const id of selectedIds.value) {
      if (seen.has(id)) continue
      const row = selectedRows.value.get(id)
      list.push({ label: row ? optionLabel(row) : `#${id}`, value: id })
   }
   return list
})

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
