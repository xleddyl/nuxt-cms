<template>
   <CmsForm
      :id="formId"
      :state="state"
      :schema="schema"
      @submit="emit('submit')"
      @error="emit('error')"
   >
      <CmsFormField
         v-for="(field, key) in fields"
         :key="key"
         :label="field.label"
         :name="key"
         :required="field.required"
      >
         <template v-if="isTranslatableField(field) && i18n.locales.length > 1" #label-actions>
            <CmsLocaleSwitch
               :model-value="localeFor(key)"
               :value="state[key] as Record<string, string> | null"
               @update:model-value="(locale: string) => setLocale(key, locale)"
            />
         </template>
         <CmsFieldInput
            v-model="state[key]"
            :field="field"
            :locale="localeFor(key)"
            :slug-source="field.from ? (state[field.from] as string | null) : undefined"
         />
      </CmsFormField>
      <div v-if="footer" class="cms-form-actions">
         <CmsButton type="submit" label="Save" :loading="loading" />
         <CmsButton
            v-if="drafts"
            type="submit"
            :label="published ? 'Make draft' : 'Publish'"
            :loading="loading"
            @click="togglePublished"
         />
      </div>
   </CmsForm>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { isTranslatableField } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { buildEntrySchema } from '../../../shared/validation'
import { useCmsRuntime } from '../../composables/cms-runtime'

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

const activeLocale = ref<Record<string, string>>({})

function localeFor(key: string) {
   return activeLocale.value[key] ?? i18n.defaultLocale
}

function setLocale(key: string, locale: string) {
   activeLocale.value = { ...activeLocale.value, [key]: locale }
}

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
