<template>
   <CmsDrawer v-model:open="open" :title="title" @close="requestClose">
      <template v-if="drafts && !loading" #badge>
         <CmsStatusBadge :published="published" />
      </template>

      <CmsSpinner v-if="loading" />

      <CmsEntryForm
         v-else
         v-model="formState"
         :fields="config.fields"
         :drafts="drafts"
         :form-id="FORM_ID"
         :loading="saving"
         :footer="false"
         @submit="save"
         @error="revertStatus"
      />

      <template #footer>
         <CmsButton
            v-if="!isNew"
            label="Delete"
            icon="trash"
            variant="ghost"
            color="error"
            @click="remove"
         />
         <span v-else />
         <div class="cms-actions">
            <CmsButton
               v-if="drafts"
               type="submit"
               :form="FORM_ID"
               :label="published ? 'Make draft' : 'Publish'"
               variant="subtle"
               :loading="saving"
               :disabled="loading"
               @click="togglePublished"
            />
            <CmsButton
               type="submit"
               :form="FORM_ID"
               label="Save"
               :loading="saving"
               :disabled="loading"
            />
         </div>
      </template>
   </CmsDrawer>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import { computed, ref, watch } from '#imports'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const FORM_ID = 'cms-entry-drawer-form'

const props = defineProps<{
   collection: string
   config: CmsEntry
   entryId: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ saved: []; deleted: [] }>()

const toast = useCmsToast()
const confirmAction = useCmsConfirm()

const endpoint = computed(() => `/api/cms/admin/${props.collection}`)
const isNew = computed(() => props.entryId === null)
const drafts = computed(() => !!props.config.drafts)
const formKeys = computed(() =>
   drafts.value ? [...Object.keys(props.config.fields), 'status'] : Object.keys(props.config.fields)
)

const { i18n: contentI18n } = useCmsRuntime()

const loading = ref(false)
const saving = ref(false)
const formState = ref<Record<string, unknown>>({})
const snapshot = ref('')

const entryName = computed(() => {
   const key = props.config.titleField
   const field = key ? props.config.fields[key] : undefined
   const value = key ? formState.value[key] : undefined
   if (!field || value == null || value === '') return ''
   if (isTranslatableField(field)) {
      const record = value as Record<string, string>
      return record[contentI18n.defaultLocale] ?? Object.values(record)[0] ?? ''
   }
   return String(value)
})

const title = computed(() => {
   if (isNew.value) return 'Add entry'
   return entryName.value || 'Untitled'
})

function emptyState() {
   return Object.fromEntries(formKeys.value.map((key) => [key, null]))
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.value.map((key) => [key, row[key] ?? null]))
}

function setState(state: Record<string, unknown>) {
   formState.value = state
   snapshot.value = JSON.stringify(state)
}

const dirty = computed(() => JSON.stringify(formState.value) !== snapshot.value)

const published = computed({
   get: () => formState.value.status === 'published',
   set: (value: boolean) => {
      formState.value.status = value ? 'published' : 'draft'
   },
})

function togglePublished() {
   published.value = !published.value
}

function revertStatus() {
   if (!drafts.value) return
   formState.value.status = (JSON.parse(snapshot.value) as Record<string, unknown>).status ?? null
}

async function load() {
   if (props.entryId === null) {
      setState(emptyState())
      return
   }
   loading.value = true
   try {
      const entry = await cmsApi<Record<string, unknown>>(`${endpoint.value}/${props.entryId}`)
      setState(pickFields(entry))
   } catch (error) {
      toast.add({
         title: 'Could not load entry',
         description: errorMessage(error),
         color: 'error',
      })
      open.value = false
   } finally {
      loading.value = false
   }
}

watch(
   () => [open.value, props.entryId] as const,
   ([isOpen]) => {
      if (isOpen) load()
   },
   { immediate: true }
)

async function requestClose() {
   if (dirty.value && !(await confirmAction('You have unsaved changes. Close anyway?'))) return
   open.value = false
}

async function save() {
   if (saving.value) return
   saving.value = true
   try {
      await (isNew.value
         ? cmsApi(endpoint.value, { method: 'POST', body: formState.value })
         : cmsApi(`${endpoint.value}/${props.entryId}`, {
              method: 'PUT',
              body: formState.value,
           }))
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: 'Saved', color: 'success' })
      emit('saved')
      open.value = false
   } catch (error) {
      toast.add({
         title: 'Save failed',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}

async function remove() {
   if (!(await confirmAction('Delete this row?'))) return
   saving.value = true
   try {
      await cmsApi(`${endpoint.value}/${props.entryId}`, { method: 'DELETE' })
      snapshot.value = JSON.stringify(formState.value)
      emit('deleted')
      open.value = false
   } catch (error) {
      toast.add({
         title: 'Delete failed',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}
</script>
