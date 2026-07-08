<template>
   <div ref="root" class="relative w-full">
      <div class="cms-field cms-field-lg flex flex-wrap items-center gap-1" @click="focusInput">
         <template v-if="multiple">
            <span v-for="value in modelArray" :key="value" class="cms-tag">
               {{ labelFor(value) }}
               <button
                  type="button"
                  class="opacity-60 hover:opacity-100"
                  @click.stop="toggle(value)"
               >
                  <CmsIcon name="x-mark" class="size-3" />
               </button>
            </span>
         </template>
         <input
            ref="input"
            class="min-w-16 flex-1 bg-transparent text-(--ui-text-highlighted) outline-none"
            :value="displayValue"
            :placeholder="placeholder"
            @input="onInput"
            @focus="onFocus"
         />
         <CmsIcon
            v-if="loading"
            name="arrow-path"
            class="ml-auto size-4 shrink-0 animate-spin text-(--ui-text-dimmed)"
         />
      </div>
      <div v-if="open" class="cms-selectmenu-panel">
         <button
            v-for="item in visibleItems"
            :key="String(item[valueKey])"
            type="button"
            class="cms-menu-item"
            @click="pick(item)"
         >
            <span class="truncate">{{ item.label }}</span>
            <CmsIcon
               v-if="!multiple && isSelected(item[valueKey])"
               name="check"
               class="cms-menu-check size-3.5"
            />
         </button>
         <div v-if="!visibleItems.length" class="cms-menu-item pointer-events-none opacity-60">
            No results
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from '#imports'

type Item = Record<string, unknown> & { label: string }

const props = withDefaults(
   defineProps<{
      items: Item[]
      valueKey?: string
      multiple?: boolean
      ignoreFilter?: boolean
      loading?: boolean
      size?: string
      placeholder?: string
   }>(),
   { valueKey: 'value' }
)

const model = defineModel<string | string[] | null>()
const search = defineModel<string>('searchTerm', { default: '' })

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

const modelArray = computed<string[]>(() =>
   props.multiple && Array.isArray(model.value) ? (model.value as string[]) : []
)

const selectedLabel = computed(() => {
   if (props.multiple) return ''
   const current = model.value as string | null
   return current == null ? '' : labelFor(current)
})

const placeholder = computed(() => {
   if (props.multiple) return modelArray.value.length ? '' : props.placeholder ?? ''
   return selectedLabel.value || props.placeholder || ''
})

/** In single mode the field doubles as a combobox: while open the user types to
 *  search; while closed it shows the current selection in solid (not placeholder)
 *  text so the chosen value reads black, not grey. */
const displayValue = computed(() => {
   if (props.multiple) return search.value
   return open.value ? search.value : selectedLabel.value
})

function onInput(event: Event) {
   search.value = (event.target as HTMLInputElement).value
   open.value = true
}

function onFocus() {
   if (!props.multiple) search.value = ''
   open.value = true
}

/** Items shown in the dropdown: filtered by the search term (unless the parent
 *  filters externally) and, in multiple mode, with already-selected values
 *  removed so picked tags disappear from the list. */
const visibleItems = computed<Item[]>(() => {
   let list = props.items
   if (!props.ignoreFilter) {
      const query = search.value.trim().toLowerCase()
      if (query) list = list.filter((item) => item.label.toLowerCase().includes(query))
   }
   if (props.multiple) {
      list = list.filter((item) => !modelArray.value.includes(item[props.valueKey] as string))
   }
   return list
})

function labelFor(value: string) {
   return props.items.find((item) => item[props.valueKey] === value)?.label ?? `#${value}`
}

function isSelected(value: unknown) {
   return props.multiple ? modelArray.value.includes(value as string) : model.value === value
}

function focusInput() {
   input.value?.focus()
}

function toggle(value: string) {
   const next = modelArray.value.includes(value)
      ? modelArray.value.filter((entry) => entry !== value)
      : [...modelArray.value, value]
   model.value = next
}

function pick(item: Item) {
   const value = item[props.valueKey] as string | null
   if (props.multiple) {
      if (value != null) toggle(value)
      search.value = ''
      focusInput()
   } else {
      model.value = value
      search.value = ''
      open.value = false
   }
}

function onOutside(event: MouseEvent) {
   if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

watch(open, (value) => {
   if (import.meta.server) return
   if (value) document.addEventListener('click', onOutside, true)
   else document.removeEventListener('click', onOutside, true)
})

onBeforeUnmount(() => {
   if (import.meta.client) document.removeEventListener('click', onOutside, true)
})
</script>
