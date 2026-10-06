<template>
   <div class="cms-editor">
      <header class="cms-editor-bar">
         <div class="cms-editor-bar-start">
            <slot name="start" />
            <div class="cms-editor-heading">
               <span class="cms-editor-title" :title="title">{{ title }}</span>
               <slot name="status" />
            </div>
         </div>
         <div class="cms-editor-bar-center">
            <CmsLocaleSwitch
               v-if="i18n.locales.length > 1"
               v-model="locale"
               :value="localeFilled"
            />
            <div class="cms-editor-devices" role="group" aria-label="Preview width">
               <button
                  v-for="option in DEVICES"
                  :key="option.id"
                  type="button"
                  class="cms-editor-device"
                  :class="{ 'is-active': device === option.id }"
                  :aria-pressed="device === option.id"
                  :aria-label="option.label"
                  :title="option.label"
                  @click="device = option.id"
               >
                  <CmsIcon :name="option.icon" class="size-4" />
               </button>
            </div>
         </div>
         <div class="cms-editor-bar-end">
            <slot name="actions" />
         </div>
      </header>

      <div class="cms-editor-body">
         <div class="cms-editor-canvas">
            <div class="cms-editor-frame" :class="`is-${device}`">
               <iframe
                  ref="frame"
                  :src="previewPath"
                  title="Live preview"
                  class="cms-editor-iframe"
                  @load="sendState"
               />
            </div>
         </div>

         <aside class="cms-editor-panel" aria-label="Inspector">
            <div v-if="tabList.length > 1" class="cms-editor-tabs">
               <div class="cms-tabs" role="tablist">
                  <button
                     v-for="tab in tabList"
                     :id="`cms-editor-tab-${tab.id}`"
                     :key="tab.id"
                     type="button"
                     role="tab"
                     class="cms-tab"
                     :class="{ 'is-active': tab.id === activeTab }"
                     :aria-selected="tab.id === activeTab"
                     :aria-controls="`cms-editor-tabpanel-${tab.id}`"
                     @click="activeTab = tab.id"
                  >
                     {{ tab.label }}
                     <span
                        v-if="tabHasError(tab.id)"
                        class="cms-editor-tab-dot"
                        aria-label="has errors"
                     />
                  </button>
               </div>
            </div>

            <div
               :id="`cms-editor-tabpanel-${activeTab}`"
               class="cms-editor-panel-body"
               role="tabpanel"
               :aria-labelledby="tabList.length > 1 ? `cms-editor-tab-${activeTab}` : undefined"
            >
               <template v-if="activeTab === 'block'">
                  <template v-if="selectedItem && selected !== null">
                     <div class="cms-editor-block-head">
                        <CmsButton
                           icon="arrow-left"
                           size="sm"
                           variant="ghost"
                           color="neutral"
                           label="All blocks"
                           @click="select(null)"
                        />
                        <span class="cms-editor-block-position">
                           {{ selected + 1 }} / {{ blocks.length }}
                        </span>
                     </div>
                     <div class="cms-editor-block-title">
                        <CmsIcon :name="selectedBlock?.icon ?? 'rectangle-stack'" class="size-4" />
                        <span>{{ selectedBlock?.label ?? selectedItem.type }}</span>
                        <span v-if="isHiddenBlock(selectedItem)" class="cms-badge is-muted">
                           Hidden
                        </span>
                     </div>
                     <div class="cms-editor-block-actions">
                        <CmsButton
                           icon="arrow-up"
                           size="sm"
                           variant="soft"
                           color="neutral"
                           aria-label="Move up"
                           title="Move up"
                           :disabled="selected === 0"
                           @click="moveSelected(-1)"
                        />
                        <CmsButton
                           icon="arrow-down"
                           size="sm"
                           variant="soft"
                           color="neutral"
                           aria-label="Move down"
                           title="Move down"
                           :disabled="selected === blocks.length - 1"
                           @click="moveSelected(1)"
                        />
                        <CmsButton
                           icon="document-duplicate"
                           size="sm"
                           variant="soft"
                           color="neutral"
                           label="Duplicate"
                           @click="duplicate(selected)"
                        />
                        <CmsButton
                           v-if="canHideBlock(selectedBlock)"
                           :icon="isHiddenBlock(selectedItem) ? 'eye' : 'eye-slash'"
                           size="sm"
                           variant="soft"
                           color="neutral"
                           :label="isHiddenBlock(selectedItem) ? 'Show' : 'Hide'"
                           @click="toggleHidden(selected)"
                        />
                        <CmsButton
                           icon="trash"
                           size="sm"
                           variant="soft"
                           color="error"
                           aria-label="Delete block"
                           title="Delete"
                           @click="remove(selected)"
                        />
                     </div>
                     <div class="cms-editor-fields">
                        <CmsFormField
                           v-for="(blockField, blockKey) in selectedBlock?.fields ?? {}"
                           :key="`${selected}-${blockKey}`"
                           :label="blockField.label"
                           :description="blockField.description"
                           :icon="fieldIcon(blockField)"
                           :required="blockField.required"
                           :name="`${fieldKey}.${selected}.${blockKey}`"
                        >
                           <CmsFieldInput
                              :model-value="selectedItem[blockKey]"
                              :field="blockField"
                              :locale="locale"
                              @update:model-value="
                                 (value: unknown) => updateBlockField(String(blockKey), value)
                              "
                           />
                        </CmsFormField>
                     </div>
                  </template>

                  <template v-else>
                     <p v-if="errors[fieldKey]" class="cms-form-error">
                        <CmsIcon name="exclamation-circle" class="size-3.5 shrink-0" />
                        {{ errors[fieldKey] }}
                     </p>
                     <div v-if="blocks.length" class="cms-editor-section">
                        <span class="cms-label">{{ blocksField.label }}</span>
                        <CmsBlockOutline
                           :items="blocks"
                           :field="blocksField"
                           :locale="locale"
                           :selected="selected"
                           @select="select"
                           @move="move"
                        />
                     </div>
                     <div class="cms-editor-section">
                        <span class="cms-label">Add a block</span>
                        <CmsBlockPalette
                           :blocks="blocksField.blocks ?? {}"
                           @pick="(type: string) => insert(blocks.length, type)"
                        />
                     </div>
                  </template>
               </template>

               <div v-else class="cms-editor-fields">
                  <template v-for="section in sections" :key="section.id">
                     <div v-if="section.title" class="cms-editor-section-title">
                        <span class="cms-label">{{ section.title }}</span>
                        <span v-if="section.description" class="cms-form-description">
                           {{ section.description }}
                        </span>
                     </div>
                     <CmsFormField
                        v-for="key in section.keys"
                        :key="key"
                        :label="fields[key]!.label"
                        :description="fields[key]!.description"
                        :icon="fieldIcon(fields[key]!)"
                        :name="key"
                        :required="fields[key]!.required"
                     >
                        <CmsFieldInput
                           :model-value="state[key]"
                           :field="fields[key]!"
                           :locale="locale"
                           :slug-source="slugSource(fields[key]!)"
                           @update:model-value="(value: unknown) => setValue(key, value)"
                        />
                     </CmsFormField>
                  </template>
               </div>
            </div>
         </aside>
      </div>

      <CmsModal v-model:open="paletteOpen" title="Insert a block">
         <template #body>
            <CmsBlockPalette :blocks="blocksField.blocks ?? {}" @pick="insertFromPalette" />
         </template>
      </CmsModal>
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig, MediaItem } from '#nuxt-cms'
import { isFieldVisible, isHiddenBlock, isTranslatableField, slugSourceValue } from '#nuxt-cms'
import {
   computed,
   onBeforeUnmount,
   onMounted,
   provide,
   reactive,
   ref,
   shallowRef,
   watch,
} from '#imports'
import { buildEntrySchema } from '../../../shared/validation'
import type {
   CmsBlockValue,
   CmsPreviewFrameMessage,
   CmsPreviewState,
} from '../../../shared/preview'
import {
   DEFAULT_CMS_PREVIEW_PATH,
   canHideBlock,
   collectMediaKeys,
   duplicateBlock,
   emptyBlock,
   insertBlock,
   isTrustedPreviewEvent,
   moveBlock,
   parseFrameMessage,
   previewEnvelope,
   previewMedia,
   removeBlock,
   selectionAfterMove,
   selectionAfterRemove,
   toggleBlockHidden,
} from '../../../shared/preview'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
import { CMS_FORM_ERRORS, fieldIcon } from '../../utils/ui'

const SEO_KEYS = ['seoTitle', 'seoDescription', 'seoImage']

const DEVICES = [
   { id: 'desktop', label: 'Desktop width', icon: 'computer-desktop' },
   { id: 'mobile', label: 'Mobile width', icon: 'device-phone-mobile' },
] as const

const props = defineProps<{
   entryName: string
   fieldKey: string
   fields: Record<string, FieldConfig>
   title: string
   content?: boolean
}>()

const state = defineModel<Record<string, unknown>>('state', { required: true })

const runtime = useCmsRuntime()
const { i18n } = runtime
const previewPath = runtime.previewPath ?? DEFAULT_CMS_PREVIEW_PATH
const confirmAction = useCmsConfirm()
const settings = useCmsSettingsState()

const locale = ref(i18n.defaultLocale)
const device = ref<(typeof DEVICES)[number]['id']>('desktop')
const selected = ref<number | null>(null)
const paletteOpen = ref(false)
const paletteIndex = ref(0)
const frame = ref<HTMLIFrameElement | null>(null)
const library = shallowRef(new Map<string, MediaItem>())

const blocksField = computed(() => props.fields[props.fieldKey]!)

const blocks = computed<CmsBlockValue[]>(() => {
   const value = state.value[props.fieldKey]
   return Array.isArray(value) ? (value as CmsBlockValue[]) : []
})

const selectedItem = computed(() =>
   selected.value === null ? undefined : blocks.value[selected.value]
)

const selectedBlock = computed(() =>
   selectedItem.value ? blocksField.value.blocks?.[String(selectedItem.value.type)] : undefined
)

const tabList = computed(() => {
   if (!props.content) return [{ id: 'block', label: 'Block' }]
   const tabs = [
      { id: 'content', label: 'Content' },
      { id: 'block', label: 'Block' },
   ]
   if (seoKeys.value.length) tabs.push({ id: 'seo', label: 'SEO' })
   return tabs
})

const activeTab = ref(props.content ? 'content' : 'block')

const seoKeys = computed(() => SEO_KEYS.filter((key) => Object.hasOwn(props.fields, key)))

const contentFields = computed(() =>
   Object.fromEntries(
      Object.entries(props.fields).filter(
         ([key]) => key !== props.fieldKey && !SEO_KEYS.includes(key)
      )
   )
)

const sections = computed(() => {
   if (activeTab.value === 'seo')
      return [{ id: 'seo', title: undefined, description: undefined, keys: seoKeys.value }]
   const layout = entryFormLayout(props.entryName, settings.value, contentFields.value)
   return layout.main
      .map((section, index) => ({
         id: `${index}-${section.title ?? ''}`,
         title: section.title,
         description: section.description,
         keys: section.rows.flat().filter((key) => {
            const field = props.fields[key]
            return !!field && isFieldVisible(field, state.value)
         }),
      }))
      .filter((section) => section.keys.length)
})

const localeFilled = computed(() => {
   const title = props.content ? state.value.title : null
   return title && typeof title === 'object' ? (title as Record<string, string>) : null
})

function setValue(key: string, value: unknown) {
   state.value = { ...state.value, [key]: value }
}

function setBlocks(list: CmsBlockValue[]) {
   setValue(props.fieldKey, list.length ? list : null)
}

function slugSource(field: FieldConfig) {
   if (!field.from) return undefined
   return slugSourceValue(props.fields[field.from], state.value[field.from], i18n.defaultLocale)
}

function select(index: number | null) {
   selected.value = index
   if (selected.value !== null) activeTab.value = 'block'
}

function blockConfigAt(index: number) {
   return blocksField.value.blocks?.[String(blocks.value[index]?.type)]
}

function insert(index: number, type: string) {
   const block = blocksField.value.blocks?.[type]
   if (!block) return
   const at = Math.min(Math.max(index, 0), blocks.value.length)
   setBlocks(insertBlock(blocks.value, at, emptyBlock(type, block)))
   select(at)
}

function insertFromPalette(type: string) {
   paletteOpen.value = false
   insert(paletteIndex.value, type)
}

function openPalette(index: number) {
   paletteIndex.value = index
   paletteOpen.value = true
}

function move(from: number, to: number) {
   if (to < 0 || to >= blocks.value.length || from === to) return
   setBlocks(moveBlock(blocks.value, from, to))
   selected.value = selectionAfterMove(selected.value, from, to)
}

function moveSelected(delta: number) {
   if (selected.value === null) return
   move(selected.value, selected.value + delta)
}

function duplicate(index: number) {
   setBlocks(duplicateBlock(blocks.value, index))
   select(index + 1)
}

function toggleHidden(index: number) {
   setBlocks(toggleBlockHidden(blocks.value, index, blockConfigAt(index)))
}

async function remove(index: number) {
   const label = blockConfigAt(index)?.label ?? 'block'
   if (!(await confirmAction(`Delete this ${label.toLowerCase()} block?`))) return
   setBlocks(removeBlock(blocks.value, index))
   selected.value = selectionAfterRemove(selected.value, index)
}

function updateBlockField(key: string, value: unknown) {
   const index = selected.value
   const current = index === null ? undefined : blocks.value[index]
   if (index === null || !current) return
   setBlocks(blocks.value.map((item, i) => (i === index ? { ...current, [key]: value } : item)))
}

const media = computed(() =>
   Object.fromEntries(
      collectMediaKeys(props.fields, state.value).map((key) => [
         key,
         previewMedia(key, library.value.get(key), runtime.mediaBaseUrl),
      ])
   )
)

const previewState = computed<CmsPreviewState>(() => ({
   entry: props.entryName,
   field: props.fieldKey,
   locale: locale.value,
   blocks: blocks.value,
   item: props.content ? state.value : null,
   media: media.value,
   selected: selected.value,
}))

function sendState() {
   const target = frame.value?.contentWindow
   if (!target) return
   const snapshot = JSON.parse(JSON.stringify(previewState.value)) as CmsPreviewState
   target.postMessage(previewEnvelope({ type: 'render', state: snapshot }), window.location.origin)
}

watch(previewState, sendState, { deep: true })

function onFrameMessage(message: CmsPreviewFrameMessage) {
   switch (message.type) {
      case 'ready':
         sendState()
         break
      case 'select':
         select(message.index)
         break
      case 'insert':
         openPalette(message.index)
         break
      case 'move':
         move(message.from, message.to)
         select(message.to)
         break
      case 'duplicate':
         duplicate(message.index)
         break
      case 'toggle-hidden':
         toggleHidden(message.index)
         break
      case 'remove':
         void remove(message.index)
         break
   }
}

function onMessage(event: MessageEvent) {
   if (!isTrustedPreviewEvent(event, window.location.origin, frame.value?.contentWindow)) return
   const message = parseFrameMessage(event.data)
   if (message) onFrameMessage(message)
}

async function loadLibrary() {
   try {
      const result = await $fetch<{ items: MediaItem[] }>('/api/cms/admin/media')
      library.value = new Map(result.items.map((item) => [item.key, item]))
   } catch {
      library.value = new Map()
   }
}

onMounted(() => {
   window.addEventListener('message', onMessage)
   void loadLibrary()
})

onBeforeUnmount(() => {
   window.removeEventListener('message', onMessage)
})

const errors = reactive<Record<string, string>>({})
provide(CMS_FORM_ERRORS, errors)

const schema = computed(() =>
   buildEntrySchema({ fields: props.fields, drafts: props.content }, i18n)
)

let submitted = false

function collectErrors() {
   for (const key of Object.keys(errors)) delete errors[key]
   const result = schema.value.safeParse(state.value)
   if (result.success) return []
   const issues = result.error.issues
   for (const issue of issues) {
      const [key, index, blockKey] = issue.path
      if (key === undefined) continue
      errors[String(key)] ??= issue.message
      if (String(key) === props.fieldKey && typeof index === 'number' && blockKey !== undefined)
         errors[`${String(key)}.${index}.${String(blockKey)}`] ??= issue.message
   }
   return issues
}

function tabOfKey(key: string) {
   if (key === props.fieldKey) return 'block'
   return SEO_KEYS.includes(key) ? 'seo' : 'content'
}

function tabHasError(tab: string) {
   return Object.keys(errors).some((key) => tabOfKey(key.split('.')[0]!) === tab)
}

function validate(): boolean {
   submitted = true
   const issues = collectErrors()
   const first = issues[0]
   if (!first) return true
   const [key, index] = first.path
   const name = String(key ?? '')
   const field = props.fields[name]
   if (name === props.fieldKey) {
      select(typeof index === 'number' ? index : null)
      activeTab.value = 'block'
   } else if (field) {
      activeTab.value = tabOfKey(name)
      if (isTranslatableField(field)) locale.value = i18n.defaultLocale
   }
   return false
}

watch(
   state,
   () => {
      if (submitted) collectErrors()
   },
   { deep: true }
)

watch(
   () => blocks.value.length,
   (length) => {
      if (selected.value !== null && selected.value >= length) selected.value = null
   }
)

defineExpose({ validate, locale })
</script>
