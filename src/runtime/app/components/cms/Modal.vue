<template>
   <Teleport to="body">
      <!-- Wrapped in .cms-scope so the vendored Tailwind utilities still apply
           once teleported outside the admin layout root. -->
      <div v-if="open" class="cms-scope">
         <div class="cms-overlay" @click.self="close">
            <div class="cms-modal cms-rise" :class="ui?.content" role="dialog" aria-modal="true">
               <div v-if="title || $slots.header" class="cms-modal-header">
                  <slot name="header">
                     <h2
                        :class="
                           ui?.title ??
                           'cms-display text-xl font-medium text-(--ui-text-highlighted)'
                        "
                     >
                        {{ title }}
                     </h2>
                  </slot>
               </div>
               <div class="cms-modal-body">
                  <slot name="body"><slot /></slot>
               </div>
            </div>
         </div>
      </div>
   </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from '#imports'

defineProps<{
   title?: string
   ui?: { content?: string; title?: string }
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ 'after:leave': [] }>()

function close() {
   open.value = false
}

function onKeydown(event: KeyboardEvent) {
   if (event.key === 'Escape') close()
}

watch(open, (value, previous) => {
   if (import.meta.server) return
   if (value) {
      document.addEventListener('keydown', onKeydown)
   } else {
      document.removeEventListener('keydown', onKeydown)
      if (previous) emit('after:leave')
   }
})

onBeforeUnmount(() => {
   if (import.meta.client) document.removeEventListener('keydown', onKeydown)
})
</script>
