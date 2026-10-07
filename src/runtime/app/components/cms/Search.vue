<template>
   <button
      ref="trigger"
      type="button"
      class="cms-search-trigger"
      aria-haspopup="dialog"
      :aria-expanded="open"
      aria-keyshortcuts="Meta+K Control+K"
      @click="show"
   >
      <CmsIcon name="magnifying-glass" class="cms-search-trigger-icon size-4 shrink-0" />
      <span class="cms-search-trigger-text">Search</span>
      <kbd class="cms-kbd">{{ shortcut }}</kbd>
   </button>

   <Teleport to="body">
      <Transition name="cms-modal">
         <div v-if="open" class="cms-scope cms-overlay cms-search-overlay" @click.self="close">
            <div
               class="cms-modal cms-search"
               role="dialog"
               aria-modal="true"
               aria-labelledby="cms-search-label"
            >
               <div class="cms-search-bar">
                  <label id="cms-search-label" for="cms-search-input" class="sr-only">
                     Search the CMS
                  </label>
                  <CmsIcon name="magnifying-glass" class="cms-search-bar-icon size-5 shrink-0" />
                  <input
                     id="cms-search-input"
                     ref="input"
                     v-model="query"
                     type="text"
                     role="combobox"
                     class="cms-search-input"
                     placeholder="Search content, fields and pages"
                     autocomplete="off"
                     spellcheck="false"
                     aria-autocomplete="list"
                     aria-controls="cms-search-results"
                     :aria-expanded="hits.length > 0"
                     :aria-activedescendant="activeId"
                     @keydown="onKeydown"
                  />
                  <CmsSpinner v-if="loading" />
                  <kbd class="cms-kbd">Esc</kbd>
               </div>

               <div class="cms-search-body">
                  <p v-if="hint" class="cms-search-hint">{{ hint }}</p>
                  <div
                     id="cms-search-results"
                     role="listbox"
                     aria-labelledby="cms-search-label"
                     class="cms-search-results"
                  >
                     <div
                        v-for="(group, groupIndex) in groups"
                        :key="group.key"
                        role="group"
                        :aria-labelledby="`cms-search-group-${groupIndex}`"
                        class="cms-search-group"
                     >
                        <div :id="`cms-search-group-${groupIndex}`" class="cms-search-group-title">
                           <span>{{ group.label }}</span>
                           <span class="cms-search-group-kind">{{ KIND_LABELS[group.kind] }}</span>
                        </div>
                        <div
                           v-for="item in group.items"
                           :id="optionId(item.index)"
                           :key="item.index"
                           role="option"
                           class="cms-search-option"
                           :class="{ 'is-active': item.index === active }"
                           :aria-selected="item.index === active"
                           @mousemove="active = item.index"
                           @click="go(item.hit)"
                        >
                           <CmsIcon
                              :name="iconOf(item.hit)"
                              class="cms-search-option-icon size-4 shrink-0"
                           />
                           <span class="cms-search-option-text">
                              <template v-if="isValueHit(item.hit)">
                                 <span class="cms-search-option-head">
                                    <span class="cms-search-option-title">
                                       {{ item.hit.title ?? item.hit.entryLabel }}
                                    </span>
                                    <span v-if="item.hit.fieldLabel" class="cms-search-option-meta">
                                       {{ item.hit.fieldLabel }}
                                    </span>
                                    <span v-if="item.hit.locale" class="cms-badge is-muted">
                                       {{ item.hit.locale }}
                                    </span>
                                 </span>
                                 <span class="cms-search-snippet">
                                    {{ item.hit.snippet.before
                                    }}<mark class="cms-search-mark">{{
                                       item.hit.snippet.match
                                    }}</mark
                                    >{{ item.hit.snippet.after }}
                                 </span>
                              </template>
                              <template v-else>
                                 <span class="cms-search-option-title">
                                    {{ item.hit.snippet.before
                                    }}<mark class="cms-search-mark">{{
                                       item.hit.snippet.match
                                    }}</mark
                                    >{{ item.hit.snippet.after }}
                                 </span>
                                 <span class="cms-search-option-meta">{{
                                    labelMeta(item.hit)
                                 }}</span>
                              </template>
                           </span>
                        </div>
                     </div>
                  </div>
                  <p v-if="truncated" class="cms-search-hint">
                     Showing the first results. Type more to narrow them down.
                  </p>
               </div>

               <div class="cms-search-footer" aria-hidden="true">
                  <span><kbd class="cms-kbd">↑</kbd><kbd class="cms-kbd">↓</kbd> to move</span>
                  <span><kbd class="cms-kbd">↵</kbd> to open</span>
                  <span><kbd class="cms-kbd">Esc</kbd> to close</span>
               </div>
               <p class="sr-only" aria-live="polite">{{ status }}</p>
            </div>
         </div>
      </Transition>
   </Teleport>
</template>

<script setup lang="ts">
import { computed, navigateTo, nextTick, onBeforeUnmount, onMounted, ref, watch } from '#imports'
import type { CmsSearchHit, CmsSearchKind, CmsSearchResponse } from '../../../shared/search'
import { isSearchableQuery, normalizeSearchQuery } from '../../../shared/search'
import { useCmsOverlay } from '../../composables/cms-overlay'
import { cmsApi } from '../../utils/api'

const DEBOUNCE_MS = 180

const KIND_LABELS: Record<CmsSearchKind, string> = {
   collection: 'Collection',
   single: 'Single',
   content: 'Content',
   page: 'Pages',
   media: 'Library',
}

const KIND_ICONS: Record<CmsSearchKind, string> = {
   collection: 'square-3-stack-3d',
   single: 'document-text',
   content: 'newspaper',
   page: 'window',
   media: 'photo',
}

const TYPE_LABELS: Record<CmsSearchHit['type'], string> = {
   entry: 'Section',
   page: 'Page',
   tab: 'Tab',
   field: 'Field',
   block: 'Block',
   value: 'Value',
   media: 'Media',
}

const TYPE_ICONS: Partial<Record<CmsSearchHit['type'], string>> = {
   page: 'window',
   tab: 'rectangle-group',
   field: 'tag',
   block: 'squares-2x2',
   value: 'bars-3-bottom-left',
   media: 'photo',
}

const emit = defineEmits<{ open: [] }>()

const open = ref(false)
const query = ref('')
const hits = ref<CmsSearchHit[]>([])
const truncated = ref(false)
const loading = ref(false)
const failed = ref(false)
const searched = ref('')
const active = ref(0)
const shortcut = ref('Ctrl K')
const trigger = ref<HTMLButtonElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

let timer: ReturnType<typeof setTimeout> | undefined
let request = 0
let returnFocus: HTMLElement | null = null

const groups = computed(() => {
   const map = new Map<
      string,
      {
         key: string
         label: string
         kind: CmsSearchKind
         items: { hit: CmsSearchHit; index: number }[]
      }
   >()
   hits.value.forEach((hit, index) => {
      const key = hit.collection ?? hit.kind
      let group = map.get(key)
      if (!group) {
         group = { key, label: hit.entryLabel, kind: hit.kind, items: [] }
         map.set(key, group)
      }
      group.items.push({ hit, index })
   })
   const ordered = [...map.values()]
   let index = 0
   for (const group of ordered) {
      for (const item of group.items) item.index = index++
   }
   return ordered
})

const flat = computed(() => groups.value.flatMap((group) => group.items.map((item) => item.hit)))

const activeId = computed(() => (flat.value.length ? optionId(active.value) : undefined))

const hint = computed(() => {
   if (!isSearchableQuery(query.value)) return 'Type at least 2 characters to search.'
   if (failed.value) return 'Search failed. Try again.'
   if (!loading.value && searched.value && !flat.value.length) {
      return `No results for "${searched.value}".`
   }
   return ''
})

const status = computed(() => {
   if (hint.value) return hint.value
   if (loading.value) return 'Searching'
   return `${flat.value.length} results`
})

function optionId(index: number) {
   return `cms-search-option-${index}`
}

function isValueHit(hit: CmsSearchHit) {
   return hit.type === 'value' || hit.type === 'media'
}

function iconOf(hit: CmsSearchHit) {
   return hit.type === 'entry' ? KIND_ICONS[hit.kind] : TYPE_ICONS[hit.type] ?? 'tag'
}

function labelMeta(hit: CmsSearchHit) {
   const parts = [TYPE_LABELS[hit.type]]
   if (hit.title) parts.push(hit.title)
   if (hit.fieldLabel && hit.type !== 'tab') parts.push(hit.fieldLabel)
   if (hit.type === 'page' && hit.id) parts.push(hit.to)
   return parts.join(' · ')
}

async function run(term: string) {
   const current = ++request
   loading.value = true
   failed.value = false
   try {
      const response = await cmsApi<CmsSearchResponse>('/api/cms/search', { query: { q: term } })
      if (current !== request) return
      hits.value = response.hits
      truncated.value = response.truncated
      searched.value = response.query
      active.value = 0
   } catch {
      if (current !== request) return
      hits.value = []
      truncated.value = false
      failed.value = true
   } finally {
      if (current === request) loading.value = false
   }
}

watch(query, (value) => {
   clearTimeout(timer)
   const term = normalizeSearchQuery(value)
   if (!isSearchableQuery(term)) {
      request++
      hits.value = []
      truncated.value = false
      loading.value = false
      failed.value = false
      searched.value = ''
      return
   }
   timer = setTimeout(() => run(term), DEBOUNCE_MS)
})

watch(active, (index) => {
   void nextTick(
      () => document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' })
   )
})

function focusInput() {
   void nextTick(() => {
      input.value?.focus()
      input.value?.select()
   })
}

function show() {
   if (open.value) {
      focusInput()
      return
   }
   returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
   emit('open')
   open.value = true
}

function close() {
   open.value = false
}

const overlay = useCmsOverlay(close)

watch(open, (value) => {
   if (value) {
      overlay.activate()
      focusInput()
   } else {
      overlay.deactivate()
      const target = returnFocus ?? trigger.value
      returnFocus = null
      void nextTick(() => target?.focus())
   }
})

function go(hit: CmsSearchHit | undefined) {
   if (!hit) return
   returnFocus = null
   close()
   void navigateTo(hit.to)
}

function onKeydown(event: KeyboardEvent) {
   const count = flat.value.length
   if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!count) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      active.value = (active.value + step + count) % count
   } else if (event.key === 'Home' && count && event.ctrlKey) {
      event.preventDefault()
      active.value = 0
   } else if (event.key === 'End' && count && event.ctrlKey) {
      event.preventDefault()
      active.value = count - 1
   } else if (event.key === 'Enter') {
      event.preventDefault()
      go(flat.value[active.value])
   }
}

function onGlobalKeydown(event: KeyboardEvent) {
   if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return
   if (!event.metaKey && !event.ctrlKey) return
   event.preventDefault()
   show()
}

onMounted(() => {
   const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
         ?.platform ??
      navigator.platform ??
      navigator.userAgent
   if (/mac|iphone|ipad|ipod/i.test(platform)) shortcut.value = '⌘K'
   document.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
   clearTimeout(timer)
   document.removeEventListener('keydown', onGlobalKeydown)
})
</script>
