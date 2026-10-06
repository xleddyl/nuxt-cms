<template>
   <CmsForm :id="formId" :state="state" :schema="schema" @submit="emit('submit')" @error="onError">
      <div v-if="tabList.length > 1" class="cms-tabs" role="tablist">
         <button
            v-for="tab in tabList"
            :key="tab.id"
            type="button"
            role="tab"
            class="cms-tab"
            :class="{ 'is-active': tab.id === activeTab }"
            :aria-selected="tab.id === activeTab"
            @click="activeTab = tab.id"
         >
            {{ tab.label }}
         </button>
      </div>
      <div class="cms-form-layout">
         <div class="cms-form-main">
            <component
               :is="section.title ? 'section' : 'div'"
               v-for="section in sections"
               :key="section.id"
               class="cms-form-section"
               :class="{ 'is-titled': !!section.title, 'is-collapsed': isCollapsed(section) }"
            >
               <button
                  v-if="section.title"
                  type="button"
                  class="cms-form-section-header"
                  :aria-expanded="!isCollapsed(section)"
                  @click="toggleSection(section.id)"
               >
                  <span class="cms-form-section-text">
                     <span class="cms-form-section-title">{{ section.title }}</span>
                     <span v-if="section.description" class="cms-form-section-description">
                        {{ section.description }}
                     </span>
                  </span>
                  <CmsIcon name="chevron-down" class="cms-form-section-chevron size-4" />
               </button>
               <div v-show="!isCollapsed(section)" class="cms-form-rows">
                  <div
                     v-for="row in section.rows"
                     :key="row.join('|')"
                     class="cms-form-row"
                     :style="{ '--cms-row-cols': row.length }"
                  >
                     <CmsFormField
                        v-for="key in row"
                        :key="key"
                        :label="fields[key]!.label"
                        :description="fields[key]!.description"
                        :icon="fieldIcon(fields[key]!)"
                        :name="key"
                        :required="fields[key]!.required"
                     >
                        <template
                           v-if="hasLocaleSwitch(fields[key]!) && i18n.locales.length > 1"
                           #label-actions
                        >
                           <CmsLocaleSwitch
                              :model-value="localeFor(key)"
                              :value="
                                 isTranslatableField(fields[key]!)
                                    ? (state[key] as Record<string, string> | null)
                                    : null
                              "
                              @update:model-value="(locale: string) => setLocale(key, locale)"
                           />
                        </template>
                        <CmsFieldInput
                           v-model="state[key]"
                           :field="fields[key]!"
                           :locale="localeFor(key)"
                           :slug-source="slugSource(fields[key]!)"
                           :entry-name="entryName"
                           :field-key="key"
                        />
                     </CmsFormField>
                  </div>
               </div>
            </component>
         </div>
      </div>
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
import type { CmsEntry, CmsFormLayout, CmsLayoutSection, CmsTab, FieldConfig } from '#nuxt-cms'
import {
   fieldTab,
   hasTranslatableBlockFields,
   isFieldVisible,
   isTranslatableField,
   resolveFormLayout,
   slugSourceValue,
} from '#nuxt-cms'
import { computed, nextTick, ref, watch } from '#imports'
import { buildEntrySchema } from '../../../shared/validation'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
import { fieldIcon } from '../../utils/ui'

const props = withDefaults(
   defineProps<{
      fields: CmsEntry['fields']
      tabs?: CmsTab[]
      entryName?: string
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

const tabList = computed(() => props.tabs ?? [])

const activeTab = ref(tabList.value[0]?.id ?? '')

watch(tabList, (tabs) => {
   if (!tabs.some((tab) => tab.id === activeTab.value)) activeTab.value = tabs[0]?.id ?? ''
})

const settings = useCmsSettingsState()

const layout = computed<CmsFormLayout>(() =>
   props.entryName
      ? entryFormLayout(props.entryName, settings.value, props.fields)
      : resolveFormLayout(props.fields, undefined)
)

function isShown(key: string) {
   const field = props.fields[key]
   if (!field || !isFieldVisible(field, state.value)) return false
   if (!tabList.value.length) return true
   return fieldTab(field, tabList.value) === activeTab.value
}

type ShownSection = CmsLayoutSection & { id: string }

const sections = computed<ShownSection[]>(() =>
   layout.value.main
      .map((section: CmsLayoutSection, index: number) => ({
         ...section,
         id: `${index}-${section.title ?? ''}`,
         rows: section.rows
            .map((row) => row.filter((key) => isShown(key)))
            .filter((row) => row.length),
      }))
      .filter((section) => section.rows.length)
)

const toggled = ref<Record<string, boolean>>({})

function isCollapsed(section: ShownSection) {
   if (!section.title) return false
   return toggled.value[section.id] ?? !!section.collapsed
}

function toggleSection(id: string) {
   const section = sections.value.find((s) => s.id === id)
   if (section) toggled.value = { ...toggled.value, [id]: !isCollapsed(section) }
}

function revealField(key: string) {
   for (const section of sections.value) {
      if (section.rows.some((row) => row.includes(key)) && isCollapsed(section)) {
         toggled.value = { ...toggled.value, [section.id]: false }
      }
   }
}

function onError() {
   const issue = schema.value.safeParse(state.value).error?.issues[0]
   const key = issue ? String(issue.path[0] ?? '') : ''
   const field = key ? props.fields[key] : undefined
   if (field && tabList.value.length) {
      const tab = fieldTab(field, tabList.value)
      if (tab) activeTab.value = tab
   }
   if (key) void nextTick(() => revealField(key))
   emit('error')
}

function slugSource(field: FieldConfig) {
   if (!field.from) return undefined
   return slugSourceValue(props.fields[field.from], state.value[field.from], i18n.defaultLocale)
}

function hasLocaleSwitch(field: FieldConfig) {
   return isTranslatableField(field) || hasTranslatableBlockFields(field)
}

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
