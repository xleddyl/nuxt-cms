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
               <div class="cms-toast-row">
                  <div class="min-w-0 flex-1">
                     <p class="cms-toast-title">
                        {{ toast.title }}
                     </p>
                     <p v-if="toast.description" class="cms-toast-description">
                        {{ toast.description }}
                     </p>
                  </div>
                  <button
                     type="button"
                     class="cms-toast-dismiss"
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
