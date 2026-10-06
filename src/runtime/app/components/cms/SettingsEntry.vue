<template>
   <div class="cms-settings-entry">
      <div class="cms-settings-entry-header">
         <div class="cms-settings-heading">
            <h2 class="cms-title cms-title-sm">{{ entry.label }}</h2>
            <p class="cms-settings-hint">{{ KIND_LABELS[entry.kind] }}</p>
         </div>
         <span class="cms-settings-status" :class="`is-${status}`" aria-live="polite">
            {{ STATUS_LABELS[status] }}
         </span>
      </div>

      <div v-if="parts.length > 1" class="cms-tabs" role="tablist">
         <button
            v-for="part in parts"
            :key="part.id"
            type="button"
            role="tab"
            class="cms-tab"
            :class="{ 'is-active': activePart === part.id }"
            :aria-selected="activePart === part.id"
            @click="activePart = part.id"
         >
            {{ part.label }}
         </button>
      </div>

      <CmsSettingsColumns
         v-if="activePart === 'columns'"
         :model-value="columns"
         :fields="entry.fields"
         :extra="listExtraColumns(name)"
         @update:model-value="saveColumns"
      />
      <CmsSettingsLayout
         v-else
         :model-value="layout"
         :fields="fields"
         :tabs="entry.tabs"
         @update:model-value="saveLayout"
      />

      <div class="cms-settings-footer">
         <CmsButton
            label="Reset to default"
            icon="arrow-uturn-left"
            variant="ghost"
            color="neutral"
            size="sm"
            :disabled="!isCustom"
            @click="resetPart"
         />
      </div>
   </div>
</template>

<script setup lang="ts">
import type { CmsEntry, CmsEntryKind, CmsFormLayout } from '#nuxt-cms'
import { computed, ref } from '#imports'
import cmsConfig from '#cms-config'
import {
   entryFields,
   entryFormLayout,
   entryListColumns,
   listExtraColumns,
   useCmsSettings,
} from '../../composables/cms-settings'
import { useCmsToast } from '../../composables/cms-toast'
import { errorMessage } from '../../utils/ui'

type Part = 'columns' | 'layout'
type Status = 'idle' | 'saving' | 'saved' | 'error'

const KIND_LABELS: Record<CmsEntryKind, string> = {
   collection: 'Collection',
   single: 'Single',
   page: 'Pages',
}

const STATUS_LABELS: Record<Status, string> = {
   idle: 'Changes save automatically',
   saving: 'Saving…',
   saved: 'Saved',
   error: 'Not saved',
}

const props = defineProps<{ name: string }>()

const { settings, save, reset } = useCmsSettings()
const toast = useCmsToast()

const entry = computed(() => (cmsConfig as Record<string, CmsEntry>)[props.name]!)
const fields = computed(() => entryFields(props.name))

const parts = computed(() => [
   ...(entry.value.kind === 'collection'
      ? [{ id: 'columns' as Part, label: 'Table columns' }]
      : []),
   { id: 'layout' as Part, label: 'Form layout' },
])

const activePart = ref<Part>(parts.value[0]!.id)

const columns = computed(() => entryListColumns(props.name, settings.value))
const layout = computed(() => entryFormLayout(props.name, settings.value, fields.value))

const isCustom = computed(() => {
   const saved = settings.value[props.name]
   return activePart.value === 'columns' ? !!saved?.columns : !!saved?.layout
})

const status = ref<Status>('idle')

async function persist(next: { columns?: string[]; layout?: CmsFormLayout }) {
   status.value = 'saving'
   try {
      if (!next.columns && !next.layout) await reset(props.name)
      else await save(props.name, next)
      status.value = 'saved'
   } catch (error) {
      status.value = 'error'
      toast.add({ title: 'Settings not saved', description: errorMessage(error), color: 'error' })
   }
}

function current() {
   const saved = settings.value[props.name] ?? {}
   return { columns: saved.columns, layout: saved.layout }
}

function saveColumns(value: string[]) {
   void persist({ ...current(), columns: value })
}

function saveLayout(value: CmsFormLayout) {
   void persist({ ...current(), layout: value })
}

function resetPart() {
   const next = current()
   if (activePart.value === 'columns') next.columns = undefined
   else next.layout = undefined
   void persist(next)
}
</script>
