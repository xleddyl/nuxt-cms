<template>
   <div class="cms-page" :class="{ 'is-fill': config.kind === 'collection' && !error }">
      <CmsPageHeader :kicker="kicker" :title="config.label">
         <CmsButton
            v-if="config.kind === 'single'"
            type="submit"
            :form="FORM_ID"
            label="Save"
            :loading="saving"
         />
      </CmsPageHeader>

      <CmsEmptyState v-if="error" icon="exclamation-triangle" title="Could not load entries">
         <CmsButton
            label="Retry"
            icon="arrow-path"
            variant="subtle"
            :loading="status === 'pending'"
            @click="reload"
         />
      </CmsEmptyState>

      <div v-else-if="config.kind === 'single'" class="cms-card cms-panel">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :form-id="FORM_ID"
            :loading="saving"
            @submit="saveSingle"
         />
      </div>

      <template v-else>
         <div class="cms-toolbar">
            <CmsInput
               v-if="total || searchTerm"
               v-model="search"
               icon="magnifying-glass"
               placeholder="Search…"
               class="flex-1"
            />
            <div class="cms-toolbar-actions">
               <CmsDropdownMenu v-if="rows.length" :items="columnItems" :content="{ align: 'end' }">
                  <CmsButton label="Columns" icon="view-columns" variant="subtle" />
               </CmsDropdownMenu>
               <CmsButton label="New entry" icon="plus" @click="openCreate" />
            </div>
         </div>

         <CmsTable
            v-if="rows.length"
            v-model:column-visibility="columnVisibility"
            :data="rows"
            :columns="columns"
            @select="onSelect"
            @reorder="reorderColumns"
         >
            <template v-for="key in mediaKeys" #[`${key}-cell`]="{ row }" :key="key">
               <CmsMediaThumb :value="row.original[key] as string | null" />
            </template>
            <template v-if="drafts" #status-cell="{ row }">
               <CmsStatusBadge :published="row.original.status === 'published'" />
            </template>
            <template #actions-cell="{ row }">
               <div class="cms-table-cell-actions">
                  <CmsButton
                     icon="trash"
                     variant="ghost"
                     color="error"
                     size="xs"
                     @click.stop="deleteRow(row.original)"
                  />
               </div>
            </template>
         </CmsTable>

         <CmsSpinner v-else-if="status === 'pending'" />

         <CmsEmptyState
            v-else-if="searchTerm"
            icon="magnifying-glass"
            title="No matching entries"
            fill
         />

         <CmsEmptyState
            v-else
            icon="sparkles"
            title="Nothing here yet"
            body="Entries you create will show up here."
            fill
         >
            <CmsButton label="New entry" icon="plus" variant="subtle" @click="openCreate" />
         </CmsEmptyState>

         <CmsPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />

         <CmsEntryDrawer
            v-model:open="drawerOpen"
            :collection="name"
            :config="config"
            :entry-id="drawerEntryId"
            @saved="refresh"
            @deleted="onDrawerDeleted"
         />
      </template>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig, FieldConfig } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   onMounted,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsRuntime } from '../composables/cms-runtime'
import { useCmsToast } from '../composables/cms-toast'
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
const toast = useCmsToast()

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}
const fieldKeys = Object.keys(config.fields)
const mediaKeys = fieldKeys.filter((key) => config.fields[key]!.type === 'media')
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
   relations?: Record<string, Record<string, unknown>>
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
const relations = computed(() => (isList(data.value) ? data.value.relations ?? {} : {}))

const reload = async () => {
   await refresh()
   if (config.kind === 'single' && !error.value) {
      formState.value =
         data.value && !isList(data.value) ? pickFields(data.value as Row) : emptyState()
   }
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
         title: 'Save failed',
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
   if (ok) toast.add({ title: 'Saved', color: 'success' })
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

function localized(value: unknown): string {
   const record = value as Record<string, string>
   return record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
}

function relationLabel(field: FieldConfig, key: string, id: unknown): string {
   const title = relations.value[key]?.[String(id)]
   if (title == null || title === '') return `#${id}`
   const target = (cmsConfig as CmsConfig)[field.to!]
   const titleField = target?.titleField ? target.fields[target.titleField] : undefined
   const label = titleField && isTranslatableField(titleField) ? localized(title) : String(title)
   return label || `#${id}`
}

function displayValue(field: FieldConfig, key: string, value: unknown): string {
   if (value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const raw = localized(value)
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
      case 'relation': {
         const ids = Array.isArray(value) ? value : [value]
         if (!ids.length) return ''
         return truncate(ids.map((id) => relationLabel(field, key, id)).join(', '))
      }
      default:
         return truncate(String(value))
   }
}

const columnOrder = ref<string[]>([...fieldKeys])

const orderedKeys = computed(() => {
   const known = columnOrder.value.filter((key) => fieldKeys.includes(key))
   return [...known, ...fieldKeys.filter((key) => !known.includes(key))]
})

const columns = computed(() => [
   ...orderedKeys.value.map((key) => ({
      id: key,
      accessorFn: (row: Row) => displayValue(config.fields[key]!, key, row[key]),
      header: config.fields[key]!.label,
      reorderable: true,
   })),
   ...(drafts ? [{ accessorKey: 'status', header: 'Status' }] : []),
   { id: 'actions', header: '' },
])

function reorderColumns(from: string, to: string) {
   const next = [...orderedKeys.value]
   const fromIndex = next.indexOf(from)
   const toIndex = next.indexOf(to)
   if (fromIndex === -1 || toIndex === -1) return
   next.splice(toIndex, 0, ...next.splice(fromIndex, 1))
   columnOrder.value = next
}

const DEFAULT_VISIBLE_COLUMNS = 4
const columnStorageKey = `cms:columns:${name}`
const columnOrderStorageKey = `cms:column-order:${name}`
const columnVisibility = ref<Record<string, boolean>>(
   Object.fromEntries(fieldKeys.map((key, index) => [key, index < DEFAULT_VISIBLE_COLUMNS]))
)

function readStored<T>(key: string): T | undefined {
   const stored = localStorage.getItem(key)
   if (!stored) return undefined
   try {
      return JSON.parse(stored) as T
   } catch {
      return undefined
   }
}

onMounted(() => {
   const storedVisibility = readStored<Record<string, boolean>>(columnStorageKey)
   if (storedVisibility) {
      columnVisibility.value = Object.fromEntries(
         fieldKeys.map((key) => [
            key,
            storedVisibility[key] ?? columnVisibility.value[key] ?? false,
         ])
      )
   }

   const storedOrder = readStored<string[]>(columnOrderStorageKey)
   if (Array.isArray(storedOrder)) {
      columnOrder.value = storedOrder.filter((key) => typeof key === 'string')
   }

   watch(
      columnVisibility,
      (value) => localStorage.setItem(columnStorageKey, JSON.stringify(value)),
      { deep: true }
   )
   watch(orderedKeys, (value) => localStorage.setItem(columnOrderStorageKey, JSON.stringify(value)))
})

const columnItems = computed(() =>
   orderedKeys.value.map((key) => ({
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

const kicker = config.kind === 'single' ? 'single document' : undefined

const drawerOpen = ref(false)
const drawerEntryId = ref<string | null>(null)

function onSelect(_event: Event, row: { original: Row }) {
   drawerEntryId.value = String(row.original.id)
   drawerOpen.value = true
}

function openCreate() {
   drawerEntryId.value = null
   drawerOpen.value = true
}

async function onDrawerDeleted() {
   if (rows.value.length === 1 && page.value > 1) page.value -= 1
   else await refresh()
}

const confirmAction = useCmsConfirm()

async function deleteRow(row: Record<string, unknown>) {
   if (!(await confirmAction('Delete this row?'))) return
   const lastOnPage = rows.value.length === 1 && page.value > 1
   const ok = await submit(() => cmsApi(`${endpoint}/${row.id}`, { method: 'DELETE' }))
   if (ok && lastOnPage) page.value -= 1
}
</script>
