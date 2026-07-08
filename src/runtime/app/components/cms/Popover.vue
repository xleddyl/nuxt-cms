<template>
   <div ref="root" class="relative inline-flex">
      <div class="contents" @click="open = !open">
         <slot />
      </div>
      <div v-if="open" class="cms-popover">
         <slot name="content" />
      </div>
   </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from '#imports'

const open = defineModel<boolean>('open', { default: false })
const root = ref<HTMLElement | null>(null)

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
