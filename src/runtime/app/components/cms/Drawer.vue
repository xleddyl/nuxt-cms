<template>
   <Teleport to="body">
      <Transition name="cms-drawer">
         <div v-if="open" class="cms-scope cms-overlay cms-overlay-drawer" @click.self="close">
            <aside class="cms-drawer" role="dialog" aria-modal="true">
               <header class="cms-drawer-header">
                  <div class="cms-actions min-w-0">
                     <h2 class="cms-title cms-title-sm truncate">
                        {{ title }}
                     </h2>
                     <slot name="badge" />
                  </div>
                  <CmsButton
                     icon="x-mark"
                     variant="ghost"
                     color="neutral"
                     size="sm"
                     aria-label="Close"
                     @click="close"
                  />
               </header>

               <div class="cms-drawer-body">
                  <slot />
               </div>

               <footer v-if="$slots.footer" class="cms-drawer-footer">
                  <slot name="footer" />
               </footer>
            </aside>
         </div>
      </Transition>
   </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from '#imports'
import { useCmsOverlay } from '../../composables/cms-overlay'

defineProps<{
   title?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ close: [] }>()

function close() {
   emit('close')
}

const overlay = useCmsOverlay(close)

watch(open, (value) => {
   if (import.meta.server) return
   if (value) {
      overlay.activate()
      document.body.style.overflow = 'hidden'
   } else {
      overlay.deactivate()
      document.body.style.overflow = ''
   }
})

onBeforeUnmount(() => {
   if (import.meta.client) document.body.style.overflow = ''
})
</script>
