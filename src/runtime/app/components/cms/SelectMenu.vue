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
            class="min-w-16 flex-1 bg-transparent outline-none"
            :value="search"
            :placeholder="placeholder"
            @input="search = ($event.target as HTMLInputElement).value"
            @focus="open = true"
         />
         <CmsIcon
            v-if="loading"
            name="arrow-path"
            class="ml-auto size-4 shrink-0 animate-spin text-(--ui-text-dimmed)"
         />
      </div>
      <div v-if="open" class="cms-selectmenu-panel">
         <button
            v-for="item in items"
            :key="String(item[valueKey])"
            type="button"
            class="cms-menu-item"
            @click="pick(item)"
         >
            <span class="truncate">{{ item.label }}</span>
            <CmsIcon
               v-if="isSelected(item[valueKey])"
               name="check"
               class="cms-menu-check size-3.5"
            />
         </button>
         <div v-if="!items.length" class="cms-menu-item pointer-events-none opacity-60">
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

const placeholder = computed(() => (props.multiple ? '' : selectedLabel.value))

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
