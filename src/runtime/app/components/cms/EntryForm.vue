<template>
   <CmsForm
      :id="formId"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-5"
      @submit="emit('submit')"
      @error="emit('error')"
   >
      <CmsFormField
         v-for="(field, key) in fields"
         :key="key"
         :label="field.label"
         :name="key"
         :required="field.required"
         :ui="CMS_FIELD_UI"
      >
         <CmsFieldInput
            v-model="state[key]"
            :field="field"
            :slug-source="field.from ? (state[field.from] as string | null) : undefined"
         />
      </CmsFormField>
      <div v-if="footer" class="flex items-center justify-end gap-3 pt-1">
         <CmsButton type="submit" label="Save" :loading="loading" class="rounded-full px-6" />
         <CmsButton
            v-if="drafts"
            type="submit"
            :label="published ? 'Make draft' : 'Publish'"
            :loading="loading"
            class="rounded-full px-6"
            @click="togglePublished"
         />
      </div>
   </CmsForm>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { computed } from '#imports'
import { buildEntrySchema } from '../../../shared/validation'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { CMS_FIELD_UI } from '../../utils/ui'

const props = withDefaults(
   defineProps<{
      fields: CmsEntry['fields']
      drafts?: boolean
      loading?: boolean
      formId?: string
      footer?: boolean
   }>(),
   { footer: true }
)

const state = defineModel<Record<string, unknown>>({ required: true })

const emit = defineEmits<{ submit: []; error: [] }>()

const { i18n } = useCmsRuntime()

const schema = computed(() =>
   buildEntrySchema({ fields: props.fields, drafts: props.drafts }, i18n)
)

const published = computed({
   get: () => state.value.status === 'published',
   set: (value: boolean) => {
      state.value.status = value ? 'published' : 'draft'
   },
})

function togglePublished() {
   published.value = !published.value
}
</script>
