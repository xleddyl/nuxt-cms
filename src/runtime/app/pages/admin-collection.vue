<template>
   <div class="cms-rise flex flex-col gap-7">
      <CmsPageHeader :kicker="kicker" :title="config.label">
         <UButton
            v-if="config.kind === 'single'"
            type="submit"
            :form="FORM_ID"
            :label="t('cms.form.save')"
            :loading="saving"
            class="rounded-full px-6"
         />
         <div v-if="config.kind === 'collection'" class="flex items-center gap-2">
            <UDropdownMenu
               v-if="rows.length"
               :items="columnItems"
               :content="{ align: 'end' }"
               :ui="{ content: 'w-48' }"
            >
               <UButton
                  :label="t('cms.collection.columns')"
                  icon="i-lucide-columns-3"
                  variant="subtle"
                  class="rounded-full px-4"
               />
            </UDropdownMenu>
            <UButton
               :label="t('cms.collection.new')"
               icon="i-lucide-plus"
               class="rounded-full px-4"
               @click="openCreate"
            />
         </div>
      </CmsPageHeader>

      <div v-if="config.kind === 'single'" class="cms-card p-7">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :form-id="FORM_ID"
            :loading="saving"
            @submit="saveSingle"
         />
      </div>

      <template v-else>
         <div v-if="rows.length" class="cms-card overflow-hidden">
            <UTable
               v-model:column-visibility="columnVisibility"
               :data="rows"
               :columns="columns"
               :ui="tableUi"
               @select="onSelect"
            >
               <template v-if="drafts" #status-cell="{ row }">
                  <button
                     type="button"
                     class="cms-badge"
                     :class="row.original.status === 'published' ? 'is-published' : 'is-draft'"
                     :title="
                        row.original.status === 'published'
                           ? t('cms.status.unpublish')
                           : t('cms.status.publish')
                     "
                     @click.stop="toggleStatus(row.original)"
                  >
                     {{
                        row.original.status === 'published'
                           ? t('cms.status.published')
                           : t('cms.status.draft')
                     }}
                  </button>
               </template>
               <template #actions-cell="{ row }">
                  <div class="flex justify-end">
                     <UButton
                        icon="i-lucide-trash-2"
                        variant="ghost"
                        color="error"
                        size="xs"
                        class="rounded-full"
                        @click.stop="deleteRow(row.original)"
                     />
                  </div>
               </template>
            </UTable>
         </div>

         <CmsEmptyState
            v-else
            icon="i-lucide-sprout"
            :title="t('cms.collection.emptyTitle')"
            :body="t('cms.collection.emptyBody')"
         >
            <UButton
               :label="t('cms.collection.new')"
               icon="i-lucide-plus"
               variant="subtle"
               class="mt-3 rounded-full px-4"
               @click="openCreate"
            />
         </CmsEmptyState>
      </template>
   </div>
</template>

<script setup lang="ts">
import type { TableRow } from '@nuxt/ui'
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onMounted,
   ref,
   useFetch,
   useI18n,
   useRoute,
   useToast,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import { useCmsRuntime } from '../composables/cms-runtime'
import { cmsApi } from '../utils/api'
import { errorMessage } from '../utils/ui'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => route.fullPath,
})

const FORM_ID = 'cms-single-form'

const route = useRoute()
const toast = useToast()
const { t } = useI18n()

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}
const fieldKeys = Object.keys(config.fields)
const drafts = config.kind === 'collection' && !!config.drafts
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

type Row = Record<string, unknown>

const endpoint: string = `/api/cms/admin/${name}`

const { data, refresh } = await useFetch<Row[] | Row | null>(endpoint)

const rows = computed<Row[]>(() => (Array.isArray(data.value) ? data.value : []))

const tableUi = {
   thead: 'border-b border-(--cms-line)',
   th: 'cms-kicker px-5 py-3 font-normal',
   td: 'px-5 py-3.5 text-sm text-(--ui-text)',
   tr: '__clickable hover:bg-(--cms-paper)/50',
}

const saving = ref(false)
const formState = ref<Record<string, unknown>>({})

function emptyState() {
   return Object.fromEntries(formKeys.map((k) => [k, null]))
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((k) => [k, row[k] ?? null]))
}

async function submit(action: () => Promise<unknown>) {
   saving.value = true
   try {
      await action()
      await refresh()
      return true
   } catch (error) {
      toast.add({
         title: t('cms.toast.saveFailed'),
         description: errorMessage(error),
         color: 'error',
      })
      return false
   } finally {
      saving.value = false
   }
}

if (config.kind === 'single') {
   formState.value =
      data.value && !Array.isArray(data.value) ? pickFields(data.value) : emptyState()
}

async function saveSingle() {
   const ok = await submit(() => cmsApi(endpoint, { method: 'PUT', body: formState.value }))
   if (ok) toast.add({ title: t('cms.toast.saved'), color: 'success' })
}

const { i18n: contentI18n } = useCmsRuntime()

function stripHtml(html: string) {
   return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
}

function truncate(value: string) {
   return value.length > 60 ? `${value.slice(0, 57)}…` : value
}

function displayValue(field: FieldConfig, value: unknown): string {
   if (value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const record = value as Record<string, string>
      const raw = record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
      return truncate(field.type === 'richtext' ? stripHtml(raw) : raw)
   }
   switch (field.type) {
      case 'boolean':
         return value ? '✓' : '—'
      case 'richtext':
         return truncate(stripHtml(String(value)))
      case 'json':
         return truncate(JSON.stringify(value))
      case 'blocks':
         return `${(value as unknown[]).length} ▤`
      default:
         return truncate(String(value))
   }
}

const columns = computed(() => [
   ...fieldKeys.map((key) => ({
      id: key,
      accessorFn: (row: Row) => displayValue(config.fields[key]!, row[key]),
      header: config.fields[key]!.label,
   })),
   ...(drafts ? [{ accessorKey: 'status', header: t('cms.collection.status') }] : []),
   { id: 'actions', header: '' },
])

const DEFAULT_VISIBLE_COLUMNS = 4
const columnStorageKey = `cms:columns:${name}`
const columnVisibility = ref<Record<string, boolean>>(
   Object.fromEntries(fieldKeys.map((key, index) => [key, index < DEFAULT_VISIBLE_COLUMNS]))
)

onMounted(() => {
   const stored = localStorage.getItem(columnStorageKey)
   if (stored) {
      try {
         const parsed = JSON.parse(stored) as Record<string, boolean>
         columnVisibility.value = Object.fromEntries(
            fieldKeys.map((key) => [key, parsed[key] ?? columnVisibility.value[key] ?? false])
         )
      } catch {
         // ignore malformed storage
      }
   }
   watch(
      columnVisibility,
      (value) => localStorage.setItem(columnStorageKey, JSON.stringify(value)),
      { deep: true }
   )
})

const columnItems = computed(() =>
   fieldKeys.map((key) => ({
      label: config.fields[key]!.label,
      type: 'checkbox' as const,
      checked: columnVisibility.value[key],
      onUpdateChecked(checked: boolean) {
         columnVisibility.value = { ...columnVisibility.value, [key]: checked }
      },
      onSelect(event: Event) {
         event.preventDefault()
      },
   }))
)

const kicker = computed(() =>
   config.kind === 'single'
      ? t('cms.collection.kickerSingle')
      : t('cms.collection.kicker', rows.value.length)
)

function onSelect(_event: Event, row: TableRow<Row>) {
   navigateTo(`/cms/${name}/${row.original.id}`)
}

async function toggleStatus(row: Record<string, unknown>) {
   const next = row.status === 'published' ? 'draft' : 'published'
   await submit(() =>
      cmsApi(`${endpoint}/${row.id}`, {
         method: 'PUT',
         body: { ...pickFields(row), status: next },
      })
   )
}

function openCreate() {
   navigateTo(`/cms/${name}/new`)
}

async function deleteRow(row: Record<string, unknown>) {
   if (!confirm(t('cms.collection.deleteConfirm'))) return
   await submit(() => cmsApi(`${endpoint}/${row.id}`, { method: 'DELETE' }))
}
</script>
