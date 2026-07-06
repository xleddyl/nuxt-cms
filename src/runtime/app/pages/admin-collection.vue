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

      <CmsEmptyState
         v-if="error"
         icon="i-lucide-triangle-alert"
         :title="t('cms.collection.loadError')"
      >
         <UButton
            :label="t('cms.collection.retry')"
            icon="i-lucide-refresh-cw"
            variant="subtle"
            class="mt-3 rounded-full px-4"
            :loading="status === 'pending'"
            @click="reload"
         />
      </CmsEmptyState>

      <div v-else-if="config.kind === 'single'" class="cms-card p-7">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :form-id="FORM_ID"
            :loading="saving"
            @submit="saveSingle"
         />
      </div>

      <template v-else>
         <UInput
            v-if="total || searchTerm"
            v-model="search"
            icon="i-lucide-search"
            :placeholder="t('cms.collection.searchPlaceholder')"
            class="max-w-xs"
         />

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

         <div v-else-if="status === 'pending'" class="flex justify-center py-10">
            <UIcon
               name="i-lucide-loader-circle"
               class="text-(--ui-text-dimmed) size-6 animate-spin"
            />
         </div>

         <CmsEmptyState
            v-else-if="searchTerm"
            icon="i-lucide-search-x"
            :title="t('cms.collection.noResults')"
         />

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

         <div v-if="total > PAGE_SIZE" class="flex justify-center">
            <UPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />
         </div>
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
import { useCmsConfirm } from '../composables/cms-confirm'
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

const PAGE_SIZE = 25
const page = ref(1)
const search = ref('')
const searchTerm = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
   clearTimeout(searchTimer)
   searchTimer = setTimeout(() => {
      searchTerm.value = value.trim()
      page.value = 1
   }, 300)
})

interface ListResponse {
   items: Row[]
   total: number
}

const listQuery = computed(() => ({
   limit: PAGE_SIZE,
   offset: (page.value - 1) * PAGE_SIZE,
   ...(searchTerm.value ? { search: searchTerm.value } : {}),
}))

const { data, refresh, error, status } = await useFetch<ListResponse | Row | null>(endpoint, {
   query: config.kind === 'collection' ? listQuery : undefined,
})

function isList(value: ListResponse | Row | null | undefined): value is ListResponse {
   return !!value && Array.isArray((value as ListResponse).items)
}

const rows = computed<Row[]>(() => (isList(data.value) ? data.value.items : []))
const total = computed(() => (isList(data.value) ? data.value.total : 0))

const reload = async () => {
   await refresh()
   if (config.kind === 'single' && !error.value) {
      formState.value =
         data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
   }
}

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
   if (saving.value) return false
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
      data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
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
      : t('cms.collection.kicker', total.value)
)

function onSelect(_event: Event, row: TableRow<Row>) {
   navigateTo(`/cms/${name}/${row.original.id}`)
}

async function toggleStatus(row: Record<string, unknown>) {
   const next = row.status === 'published' ? 'draft' : 'published'
   await submit(async () => {
      const fresh = await cmsApi<Record<string, unknown>>(`${endpoint}/${row.id}`)
      await cmsApi(`${endpoint}/${row.id}`, {
         method: 'PUT',
         body: { ...pickFields(fresh), status: next },
      })
   })
}

function openCreate() {
   navigateTo(`/cms/${name}/new`)
}

const confirmAction = useCmsConfirm()

async function deleteRow(row: Record<string, unknown>) {
   if (!(await confirmAction(t('cms.collection.deleteConfirm')))) return
   const lastOnPage = rows.value.length === 1 && page.value > 1
   const ok = await submit(() => cmsApi(`${endpoint}/${row.id}`, { method: 'DELETE' }))
   if (ok && lastOnPage) page.value -= 1
}
</script>
