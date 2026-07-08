<template>
   <div ref="root" class="relative inline-flex">
      <div class="contents" @click="open = !open">
         <slot />
      </div>
      <div
         v-if="open"
         class="cms-menu"
         :class="[content?.align === 'end' && 'align-end', ui?.content]"
      >
         <button
            v-for="(item, index) in items"
            :key="index"
            type="button"
            class="cms-menu-item"
            @click="onClick(item, $event)"
         >
            <span>{{ item.label }}</span>
            <CmsIcon
               v-if="item.type === 'checkbox' && item.checked"
               name="check"
               class="cms-menu-check size-3.5"
            />
         </button>
      </div>
   </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from '#imports'

interface MenuItem {
   label: string
   type?: 'checkbox'
   checked?: boolean
   onSelect?: (event: Event) => void
   onUpdateChecked?: (checked: boolean) => void
}

defineProps<{
   items: MenuItem[]
   content?: { align?: 'start' | 'end' }
   ui?: { content?: string }
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function onClick(item: MenuItem, event: Event) {
   if (item.type === 'checkbox') {
      item.onUpdateChecked?.(!item.checked)
      return
   }
   item.onSelect?.(event)
   if (!event.defaultPrevented) open.value = false
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
