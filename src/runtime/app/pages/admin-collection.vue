<template>
   <div class="cms-page" :class="{ 'is-fill': isCollectionKind(config) && !error }">
      <CmsPageHeader
         :title="config.label"
         :icon="kindMeta.icon"
         :description="kindMeta.description"
      >
         <template v-if="config.kind !== 'single' && total" #badge>
            <span :key="total" class="cms-count">{{ total }}</span>
         </template>
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
            variant="soft"
            :loading="status === 'pending'"
            @click="reload"
         />
      </CmsEmptyState>

      <div v-else-if="config.kind === 'single'" class="cms-card cms-panel">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :tabs="config.tabs"
            :entry-name="name"
            :form-id="FORM_ID"
            :loading="saving"
            :focus="focus"
            @submit="saveSingle"
         />
      </div>

      <template v-else-if="config.kind === 'page'">
         <div class="cms-toolbar">
            <CmsInput
               v-if="total || searchTerm"
               v-model="search"
               icon="magnifying-glass"
               placeholder="Search…"
               class="flex-1"
            />
         </div>

         <div v-if="pageTree.length" class="cms-card cms-tree">
            <NuxtLink
               v-for="(node, index) in pageTree"
               :key="String(node.row.id)"
               :to="`/cms/${name}/${node.row.id}`"
               class="cms-tree-row"
               :style="{
                  paddingLeft: `${1 + node.depth * 1.5}rem`,
                  '--cms-row-delay': `${Math.min(index, 14) * 24}ms`,
               }"
            >
               <CmsIcon
                  v-if="node.depth"
                  name="arrow-turn-left-up"
                  class="cms-tree-branch size-3.5"
               />
               <span class="cms-tree-doc">
                  <CmsIcon name="document-text" class="size-4" />
               </span>
               <div class="min-w-0 flex-1">
                  <div class="cms-tree-title">
                     {{ node.row.label }}
                  </div>
                  <div class="cms-tree-path">{{ node.row.path }}</div>
               </div>
               <span class="cms-tree-meta">{{ lastEdit(node.row.updatedAt) }}</span>
               <CmsIcon name="chevron-right" class="cms-tree-chevron size-4" />
            </NuxtLink>
         </div>

         <CmsSpinner v-else-if="status === 'pending'" />

         <CmsEmptyState v-else-if="searchTerm" icon="magnifying-glass" title="No matching pages" />

         <CmsEmptyState
            v-else
            icon="document-text"
            title="No pages yet"
            body="Pages come from the routes of the app."
         />

         <CmsPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />
      </template>

      <template v-else>
         <div class="cms-toolbar">
            <CmsInput
               v-if="total || searchTerm"
               v-model="search"
               icon="magnifying-glass"
               placeholder="Search…"
               class="flex-1"
            />
            <div v-if="selected.length" :key="'bulk'" class="cms-toolbar-actions cms-bulk-actions">
               <span class="cms-bulk-count">{{ selected.length }} selected</span>
               <CmsButton
                  icon="x-mark"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  aria-label="Clear selection"
                  title="Clear selection"
                  @click="selected = []"
               />
               <template v-if="drafts">
                  <CmsButton
                     label="Draft"
                     icon="pencil-square"
                     variant="soft"
                     :disabled="saving"
                     @click="bulkStatus('draft')"
                  />
                  <CmsButton
                     label="Publish"
                     icon="check-circle"
                     variant="soft"
                     :disabled="saving"
                     @click="bulkStatus('published')"
                  />
               </template>
               <CmsButton
                  label="Delete"
                  icon="trash"
                  color="error"
                  :loading="saving"
                  @click="bulkDelete"
               />
            </div>
            <div v-else :key="'default'" class="cms-toolbar-actions">
               <CmsButton label="New entry" icon="plus" @click="openCreate" />
            </div>
         </div>

         <CmsTable
            v-if="rows.length"
            v-model:selected="selected"
            selectable
            v-model:sort="sort"
            :data="rows"
            :columns="columns"
            @select="onSelect"
         >
            <template v-for="key in mediaKeys" #[`${key}-cell`]="{ row }" :key="key">
               <CmsMediaThumb :value="mediaThumbValue(key, row.original[key])" />
            </template>
            <template v-if="drafts" #status-cell="{ row }">
               <CmsStatusBadge
                  :published="row.original.status === 'published'"
                  :scheduled="mounted && isContent && isScheduledContent(row.original)"
                  :at="formatDateTime(row.original.publishedAt)"
               />
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
            <CmsButton label="New entry" icon="plus" variant="soft" @click="openCreate" />
         </CmsEmptyState>

         <CmsPagination v-model:page="page" :total="total" :items-per-page="PAGE_SIZE" />

         <CmsEntryDrawer
            v-if="!isContent"
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
import {
   isCollectionKind,
   isScheduledContent,
   isTranslatableField,
   isTranslatableMediaField,
   pageParentPath,
   pickTranslatedMedia,
} from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onMounted,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import { readSearchFocus } from '../../shared/search'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsRuntime } from '../composables/cms-runtime'
import { entryListColumns, useCmsSettingsState } from '../composables/cms-settings'
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
const focus = readSearchFocus(route.query)

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config) {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}
const KIND_META = {
   collection: { icon: 'square-3-stack-3d', description: 'Collection of entries.' },
   single: { icon: 'document-text', description: 'Single entry, edited in place.' },
   page: { icon: 'window', description: 'Content for the routes of your app.' },
   content: { icon: 'newspaper', description: 'Items built from blocks, with scheduling.' },
}
const kindMeta = { ...KIND_META[config.kind], icon: config.icon ?? KIND_META[config.kind].icon }
const fieldKeys = Object.keys(config.fields)
const mediaKeys = fieldKeys.filter((key) => config.fields[key]!.type === 'media')
const isContent = config.kind === 'content'
const drafts = isCollectionKind(config) && !!config.drafts
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

type Row = Record<string, unknown>

interface TableSort {
   key: string
   order: 'asc' | 'desc'
}

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

const sort = ref<TableSort | null>(null)

watch(sort, () => {
   page.value = 1
})

const listQuery = computed(() => ({
   limit: PAGE_SIZE,
   offset: (page.value - 1) * PAGE_SIZE,
   ...(searchTerm.value ? { search: searchTerm.value } : {}),
   ...(sort.value ? { sort: sort.value.key, order: sort.value.order } : {}),
}))

const { data, refresh, error, status } = await useFetch<ListResponse | Row | null>(endpoint, {
   query: config.kind === 'single' ? undefined : listQuery,
})

function isList(value: ListResponse | Row | null | undefined): value is ListResponse {
   return !!value && Array.isArray((value as ListResponse).items)
}

const rows = computed<Row[]>(() => (isList(data.value) ? data.value.items : []))

const mounted = ref(false)

onMounted(() => {
   mounted.value = true
})

function lastEdit(value: unknown) {
   if (typeof value !== 'string' || !value) return 'Never saved'
   const stamp = value.includes('T') ? value : value.replace(' ', 'T') + 'Z'
   const date = new Date(stamp)
   if (Number.isNaN(date.getTime())) return `Last edit ${value.slice(0, 10)}`
   if (!mounted.value) return `Last edit ${value.slice(0, 10)}`
   return `Last edit ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })}`
}

const pageTree = computed(() => {
   const byPath = new Set(rows.value.map((row) => String(row.path)))
   const depthOf = (path: string) => {
      let depth = 0
      let parent = pageParentPath(path)
      while (parent) {
         if (byPath.has(parent)) depth++
         parent = pageParentPath(parent)
      }
      return depth
   }
   return rows.value.map((row) => ({ row, depth: depthOf(String(row.path)) }))
})
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

function mediaThumbValue(key: string, value: unknown): string | null {
   const field = config?.fields[key]
   if (!field || !isTranslatableMediaField(field)) return (value as string | null) ?? null
   const locale = contentI18n.defaultLocale
   return pickTranslatedMedia(value as Record<string, string> | null, locale, locale)
}

function formatDateTime(value: unknown): string {
   if (typeof value !== 'string' || !value) return ''
   const date = new Date(value)
   if (Number.isNaN(date.getTime()) || !mounted.value) return value.slice(0, 16).replace('T', ' ')
   return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
   })}`
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
      case 'datetime':
         return formatDateTime(value)
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

function isSortable(field: FieldConfig) {
   if (field.type === 'blocks') return false
   return !(field.type === 'relation' && field.cardinality === 'many-to-many')
}

const settings = useCmsSettingsState()

const columns = computed(() =>
   entryListColumns(name, settings.value).map((key) =>
      key === 'status' && !config.fields.status
         ? { accessorKey: 'status', header: 'Status', sortable: true }
         : {
              id: key,
              accessorFn: (row: Row) => displayValue(config.fields[key]!, key, row[key]),
              header: config.fields[key]!.label,
              sortable: isSortable(config.fields[key]!),
           }
   )
)

const drawerOpen = ref(false)
const drawerEntryId = ref<string | null>(null)

function onSelect(_event: Event, row: { original: Row }) {
   if (isContent) {
      void navigateTo(`/cms/${name}/${row.original.id}`)
      return
   }
   drawerEntryId.value = String(row.original.id)
   drawerOpen.value = true
}

function openCreate() {
   if (isContent) {
      void navigateTo(`/cms/${name}/new`)
      return
   }
   drawerEntryId.value = null
   drawerOpen.value = true
}

async function onDrawerDeleted() {
   if (rows.value.length === 1 && page.value > 1) page.value -= 1
   else await refresh()
}

const confirmAction = useCmsConfirm()

const selected = ref<string[]>([])

watch(rows, (current) => {
   const ids = new Set(current.map((row) => String(row.id)))
   selected.value = selected.value.filter((id) => ids.has(id))
})

function entriesLabel(count: number) {
   return `${count} ${count === 1 ? 'entry' : 'entries'}`
}

async function runBulk(ids: string[], action: (id: string) => Promise<unknown>) {
   saving.value = true
   try {
      const results = await Promise.allSettled(ids.map(action))
      const failed = results.flatMap((result, index) =>
         result.status === 'rejected' ? [{ id: ids[index]!, reason: result.reason }] : []
      )
      await refresh()
      selected.value = failed.map((f) => f.id)
      return failed
   } finally {
      saving.value = false
   }
}

function reportBulk(done: string, total: number, failed: { reason: unknown }[]) {
   const succeeded = total - failed.length
   if (succeeded) toast.add({ title: `${done}: ${entriesLabel(succeeded)}`, color: 'success' })
   if (failed.length) {
      toast.add({
         title: `${entriesLabel(failed.length)} not changed`,
         description: errorMessage(failed[0]!.reason),
         color: 'error',
      })
   }
}

async function bulkDelete() {
   const ids = [...selected.value]
   if (!ids.length || saving.value) return
   if (!(await confirmAction(`Delete ${entriesLabel(ids.length)}?`))) return
   const emptiesPage = ids.length >= rows.value.length && page.value > 1
   const failed = await runBulk(ids, (id) => cmsApi(`${endpoint}/${id}`, { method: 'DELETE' }))
   reportBulk('Deleted', ids.length, failed)
   if (!failed.length && emptiesPage) page.value -= 1
}

async function bulkStatus(status: 'draft' | 'published') {
   const ids = [...selected.value]
   if (!ids.length || saving.value) return
   const failed = await runBulk(ids, async (id) => {
      const entry = await cmsApi<Row>(`${endpoint}/${id}`)
      const body = Object.fromEntries(formKeys.map((key) => [key, entry[key] ?? null]))
      return cmsApi(`${endpoint}/${id}`, { method: 'PUT', body: { ...body, status } })
   })
   reportBulk(status === 'published' ? 'Published' : 'Moved to draft', ids.length, failed)
}
</script>
