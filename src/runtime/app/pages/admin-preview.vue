<template>
   <div class="cms-preview" :data-cms-preview="state ? 'ready' : 'waiting'">
      <template v-if="state && field">
         <component :is="wrapper" v-if="wrapper && item" :item="item" :locale="state.locale">
            <CmsBlocks :blocks="blocks" :entry="blockEntry" :field="state.field" annotate />
            <div v-if="!visibleCount" class="cms-preview-empty">
               <button
                  type="button"
                  class="cms-preview-empty-button"
                  data-cms-preview-keep
                  @click="post({ type: 'insert', index: state.blocks.length })"
               >
                  <CmsIcon name="plus" />
                  <span>Add a block</span>
               </button>
            </div>
         </component>
         <template v-else>
            <CmsBlocks :blocks="blocks" :entry="blockEntry" :field="state.field" annotate />
            <div v-if="!visibleCount" class="cms-preview-empty">
               <button
                  type="button"
                  class="cms-preview-empty-button"
                  data-cms-preview-keep
                  @click="post({ type: 'insert', index: state.blocks.length })"
               >
                  <CmsIcon name="plus" />
                  <span>Add a block</span>
               </button>
            </div>
         </template>
         <PreviewOverlay
            :field="field"
            :total="state.blocks.length"
            :selected="state.selected"
            :version="version"
            @message="post"
         />
      </template>
      <p v-else-if="standalone" class="cms-preview-notice">
         This page shows the live preview of the visual editor. Open an item in the admin to use it.
      </p>
   </div>
</template>

<script setup lang="ts">
import type { CmsBlockEntryName } from '#cms-types'
import type { CmsConfig } from '#nuxt-cms'
import { entryFieldsFor, isHiddenBlock } from '#nuxt-cms'
import {
   computed,
   definePageMeta,
   onBeforeUnmount,
   onMounted,
   ref,
   shallowRef,
   useHead,
} from '#imports'
import cmsConfig from '#cms-config'
import { cmsPreviewComponents } from '#cms-blocks'
import type { CmsPreviewFrameMessage, CmsPreviewState } from '../../shared/preview'
import {
   isTrustedPreviewEvent,
   parseHostMessage,
   previewBlocks,
   previewEnvelope,
   previewItem,
} from '../../shared/preview'
import type { CmsBlockItem } from '../blocks/resolve'
import { useCmsRuntime } from '../composables/cms-runtime'
import PreviewOverlay from '../preview/PreviewOverlay.vue'

definePageMeta({ middleware: 'cms-auth' })

const { i18n } = useCmsRuntime()

const state = shallowRef<CmsPreviewState | null>(null)
const version = ref(0)
const standalone = ref(false)

useHead({
   title: 'Preview',
   meta: [{ name: 'robots', content: 'noindex, nofollow' }],
   htmlAttrs: { lang: computed(() => state.value?.locale) },
})

const entry = computed(() =>
   state.value ? (cmsConfig as CmsConfig)[state.value.entry] : undefined
)

const blockEntry = computed(() => state.value?.entry as CmsBlockEntryName | undefined)

const fields = computed(() => (entry.value ? entryFieldsFor(entry.value) : {}))

const field = computed(() => {
   const candidate = state.value ? fields.value[state.value.field] : undefined
   return candidate?.type === 'blocks' ? candidate : undefined
})

const blocks = computed<CmsBlockItem[]>(() =>
   state.value && field.value
      ? (previewBlocks(
           field.value,
           state.value.blocks,
           state.value.locale,
           i18n.defaultLocale,
           state.value.media
        ) as unknown as CmsBlockItem[])
      : []
)

const visibleCount = computed(() => blocks.value.filter((block) => !isHiddenBlock(block)).length)

const item = computed(() =>
   state.value?.item && entry.value?.kind === 'content'
      ? previewItem(
           fields.value,
           state.value.item,
           state.value.locale,
           i18n.defaultLocale,
           state.value.media
        )
      : null
)

const wrapper = computed(() =>
   state.value && entry.value?.kind === 'content'
      ? cmsPreviewComponents[state.value.entry]
      : undefined
)

function post(message: CmsPreviewFrameMessage) {
   if (window.parent === window) return
   window.parent.postMessage(previewEnvelope(message), window.location.origin)
}

function onMessage(event: MessageEvent) {
   if (!isTrustedPreviewEvent(event, window.location.origin, window.parent)) return
   const message = parseHostMessage(event.data)
   if (!message) return
   state.value = message.state
   version.value++
}

onMounted(() => {
   standalone.value = window.parent === window
   window.addEventListener('message', onMessage)
   post({ type: 'ready' })
})

onBeforeUnmount(() => {
   window.removeEventListener('message', onMessage)
})
</script>

<style>
.cms-preview-overlay {
   --cms-preview-accent: #5b5bd6;
   --cms-preview-ink: #111114;
   --cms-preview-surface: #ffffff;
   --cms-preview-line: rgb(17 17 20 / 0.12);
   --cms-preview-danger: #d9383a;
   position: fixed;
   inset: 0;
   z-index: 2147483000;
   pointer-events: none;
   font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
   font-size: 12px;
   line-height: 1;
}

.cms-preview-outline {
   position: absolute;
   box-sizing: border-box;
   border: 1px dashed color-mix(in oklab, var(--cms-preview-accent) 70%, transparent);
   border-radius: 2px;
}

.cms-preview-outline.is-selected {
   border: 2px solid var(--cms-preview-accent);
   box-shadow: 0 0 0 4px color-mix(in oklab, var(--cms-preview-accent) 14%, transparent);
}

.cms-preview-label {
   position: absolute;
   top: -1px;
   left: -1px;
   padding: 4px 7px;
   border-radius: 2px 0 6px 0;
   background: var(--cms-preview-accent);
   color: #ffffff;
   font-weight: 600;
   letter-spacing: 0.01em;
   white-space: nowrap;
}

.cms-preview-toolbar {
   position: absolute;
   display: flex;
   align-items: center;
   gap: 2px;
   padding: 3px;
   transform: translateX(-100%);
   border-radius: 8px;
   background: var(--cms-preview-surface);
   box-shadow:
      0 0 0 1px var(--cms-preview-line),
      0 8px 24px -8px rgb(17 17 20 / 0.28);
   pointer-events: auto;
}

.cms-preview-toolbar:not(.is-selected) {
   opacity: 0.92;
}

.cms-preview-tool,
.cms-preview-insert,
.cms-preview-empty-button {
   all: unset;
   box-sizing: border-box;
   display: inline-flex;
   align-items: center;
   justify-content: center;
   cursor: pointer;
}

.cms-preview-tool {
   width: 28px;
   height: 28px;
   border-radius: 6px;
   color: var(--cms-preview-ink);
}

.cms-preview-tool:hover:not(:disabled) {
   background: rgb(17 17 20 / 0.06);
}

.cms-preview-tool:disabled {
   opacity: 0.35;
   cursor: default;
}

.cms-preview-tool.is-danger {
   color: var(--cms-preview-danger);
}

.cms-preview-handle {
   cursor: grab;
   touch-action: none;
}

.cms-preview-overlay .cms-preview-tool:focus-visible,
.cms-preview-overlay .cms-preview-insert:focus-visible,
.cms-preview .cms-preview-empty .cms-preview-empty-button:focus-visible {
   outline: 2px solid var(--cms-preview-accent);
   outline-offset: 2px;
}

.cms-preview-separator {
   width: 1px;
   height: 18px;
   margin: 0 2px;
   background: var(--cms-preview-line);
}

.cms-preview-overlay svg {
   width: 16px;
   height: 16px;
   flex-shrink: 0;
}

.cms-preview-insert {
   position: absolute;
   width: 26px;
   height: 26px;
   margin: -13px 0 0 -13px;
   border-radius: 999px;
   background: var(--cms-preview-accent);
   color: #ffffff;
   box-shadow: 0 2px 8px -2px rgb(17 17 20 / 0.4);
   opacity: 0;
   transform: scale(0.85);
   transition:
      opacity 140ms ease,
      transform 140ms ease;
   pointer-events: auto;
}

.cms-preview-insert.is-near,
.cms-preview-insert:hover,
.cms-preview-insert:focus-visible {
   opacity: 1;
   transform: scale(1);
}

.cms-preview-overlay.is-dragging .cms-preview-insert,
.cms-preview-overlay.is-dragging .cms-preview-toolbar:not(.is-selected) {
   visibility: hidden;
}

.cms-preview-dropline {
   position: absolute;
   height: 3px;
   margin-top: -1.5px;
   border-radius: 3px;
   background: var(--cms-preview-accent);
   box-shadow: 0 0 0 3px color-mix(in oklab, var(--cms-preview-accent) 20%, transparent);
}

.cms-preview-grabbing,
.cms-preview-grabbing * {
   cursor: grabbing !important;
   user-select: none !important;
}

.cms-preview-empty {
   display: flex;
   justify-content: center;
   padding: 48px 16px;
}

.cms-preview-empty-button {
   gap: 8px;
   padding: 12px 18px;
   border: 1px dashed #5b5bd6;
   border-radius: 10px;
   color: #5b5bd6;
   font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
   font-size: 14px;
   font-weight: 600;
}

.cms-preview-empty-button svg {
   width: 18px;
   height: 18px;
}

.cms-preview-notice {
   max-width: 32rem;
   margin: 64px auto;
   padding: 0 16px;
   font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      'Segoe UI',
      sans-serif;
   color: #6b6b75;
   text-align: center;
}
</style>
