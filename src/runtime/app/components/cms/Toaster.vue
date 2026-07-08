<template>
   <Teleport to="body">
      <div v-if="toasts.length" class="cms-scope">
         <div class="cms-toaster">
            <div
               v-for="toast in toasts"
               :key="toast.id"
               class="cms-toast cms-rise"
               :class="{
                  'is-success': toast.color === 'success',
                  'is-error': toast.color === 'error',
               }"
            >
               <div class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                     <p class="text-[13px] font-medium text-(--ui-text-highlighted)">
                        {{ toast.title }}
                     </p>
                     <p v-if="toast.description" class="mt-0.5 text-xs text-(--ui-text-muted)">
                        {{ toast.description }}
                     </p>
                  </div>
                  <button
                     type="button"
                     class="shrink-0 text-(--ui-text-dimmed) hover:text-(--ui-text)"
                     aria-label="Dismiss"
                     @click="remove(toast.id)"
                  >
                     <CmsIcon name="x-mark" class="size-4" />
                  </button>
               </div>
            </div>
         </div>
      </div>
   </Teleport>
</template>

<script setup lang="ts">
import { useCmsToast, useCmsToastState } from '../../composables/cms-toast'

const toasts = useCmsToastState()
const { remove } = useCmsToast()
</script>
