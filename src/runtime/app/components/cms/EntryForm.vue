<template>
   <UForm
      :id="formId"
      :state="state"
      :schema="schema"
      class="flex flex-col gap-5"
      @submit="emit('submit')"
      @error="emit('error')"
   >
      <UFormField
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
      </UFormField>
      <div v-if="footer" class="flex items-center justify-end gap-3 pt-1">
         <UButton
            type="submit"
            :label="t('cms.form.save')"
            :loading="loading"
            class="rounded-full px-6"
         />
         <UButton
            v-if="drafts"
            type="submit"
            :label="published ? t('cms.status.unpublish') : t('cms.status.publish')"
            :loading="loading"
            class="rounded-full px-6"
            @click="togglePublished"
         />
      </div>
   </UForm>
</template>

<script setup lang="ts">
import type { CmsEntry } from '#nuxt-cms'
import { computed, useI18n } from '#imports'
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

const { t } = useI18n()

const { i18n } = useCmsRuntime()

const schema = computed(() =>
   buildEntrySchema({ fields: props.fields, drafts: props.drafts }, i18n, {
      required: t('cms.validation.required'),
      invalidDate: t('cms.validation.invalidDate'),
      invalidEmail: t('cms.validation.invalidEmail'),
      invalidSlug: t('cms.validation.invalidSlug'),
      unknownLocale: t('cms.validation.unknownLocale'),
      requiredLocale: (locale: string) => t('cms.validation.requiredLocale', { locale }),
   })
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
