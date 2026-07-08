<template>
   <div class="cms-rise flex flex-col gap-7">
      <CmsPageHeader :kicker="config.label" :title="isNew ? 'New entry' : 'Edit entry'">
         <template v-if="drafts" #badge>
            <span
               class="cms-badge pointer-events-none"
               :class="published ? 'is-published' : 'is-draft'"
            >
               {{ published ? 'Published' : 'Draft' }}
            </span>
         </template>
         <div class="flex items-center gap-3">
            <CmsButton
               label="Back"
               icon="arrow-left"
               variant="subtle"
               class="rounded-full px-4"
               @click="goBack"
            />
            <CmsButton
               type="submit"
               :form="FORM_ID"
               label="Save"
               :loading="saving"
               class="rounded-full px-6"
            />
            <CmsButton
               v-if="drafts"
               type="submit"
               :form="FORM_ID"
               :label="published ? 'Make draft' : 'Publish'"
               :loading="saving"
               class="rounded-full px-6"
               @click="togglePublished"
            />
         </div>
      </CmsPageHeader>

      <div class="cms-card p-7">
         <CmsEntryForm
            v-model="formState"
            :fields="config.fields"
            :drafts="drafts"
            :form-id="FORM_ID"
            :loading="saving"
            @submit="save"
            @error="revertStatus"
         />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import {
   computed,
   createError,
   definePageMeta,
   navigateTo,
   onBeforeRouteLeave,
   onBeforeUnmount,
   ref,
   useFetch,
   useRoute,
   watch,
} from '#imports'
import cmsConfig from '#cms-config'
import { useCmsConfirm } from '../composables/cms-confirm'
import { useCmsToast } from '../composables/cms-toast'
import { cmsApi } from '../utils/api'
import { errorMessage } from '../utils/ui'

const FORM_ID = 'cms-entry-form'

definePageMeta({
   layout: 'cms-admin',
   middleware: 'cms-auth',
   validate: (route) => Object.hasOwn(cmsConfig, route.params.collection as string),
   key: (route) => route.fullPath,
})

const route = useRoute()
const toast = useCmsToast()

const name = route.params.collection as string
const config = (cmsConfig as CmsConfig)[name]
if (!config || config.kind !== 'collection') {
   throw createError({ statusCode: 404, statusMessage: 'Unknown collection', fatal: true })
}

const id = route.params.id as string | undefined
const isNew = id === undefined
const drafts = !!config.drafts
const fieldKeys = Object.keys(config.fields)
const formKeys = drafts ? [...fieldKeys, 'status'] : fieldKeys

const endpoint: string = `/api/cms/admin/${name}`

function emptyState() {
   return Object.fromEntries(formKeys.map((k) => [k, null]))
}

function pickFields(row: Record<string, unknown>) {
   return Object.fromEntries(formKeys.map((k) => [k, row[k] ?? null]))
}

const formState = ref<Record<string, unknown>>(emptyState())

if (!isNew) {
   const { data, error } = await useFetch<Record<string, unknown> | null>(`${endpoint}/${id}`)
   if (error.value || !data.value) {
      const statusCode = error.value?.statusCode ?? 404
      throw createError({
         statusCode,
         statusMessage: statusCode === 404 ? 'Entry not found' : 'Failed to load entry',
         fatal: true,
      })
   }
   formState.value = pickFields(data.value)
}

const saving = ref(false)

const snapshot = ref(JSON.stringify(formState.value))
const dirty = computed(() => JSON.stringify(formState.value) !== snapshot.value)

function onBeforeUnload(event: BeforeUnloadEvent) {
   event.preventDefault()
}

watch(dirty, (value) => {
   if (value) window.addEventListener('beforeunload', onBeforeUnload)
   else window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

const confirmAction = useCmsConfirm()

onBeforeRouteLeave(async () => {
   if (dirty.value && !(await confirmAction('You have unsaved changes. Leave anyway?')))
      return false
})

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
   if (!drafts) return
   formState.value.status = (JSON.parse(snapshot.value) as Record<string, unknown>).status ?? null
}

function goBack() {
   navigateTo(`/cms/${name}`)
}

async function save() {
   saving.value = true
   try {
      await (isNew
         ? cmsApi(endpoint, { method: 'POST', body: formState.value })
         : cmsApi(`${endpoint}/${id}`, { method: 'PUT', body: formState.value }))
      snapshot.value = JSON.stringify(formState.value)
      toast.add({ title: 'Saved', color: 'success' })
      goBack()
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
</script>
