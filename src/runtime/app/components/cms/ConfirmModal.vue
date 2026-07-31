<template>
   <CmsModal
      v-model:open="state.open"
      :title="state.title ?? 'Are you sure?'"
      size="sm"
      @after:leave="finish(false)"
   >
      <template #body>
         <div class="cms-form">
            <p class="text-sm">{{ state.message }}</p>
            <div class="cms-actions is-end">
               <CmsButton label="Cancel" variant="subtle" color="neutral" @click="finish(false)" />
               <CmsButton
                  :label="state.confirmLabel ?? 'Confirm'"
                  color="error"
                  @click="finish(true)"
               />
            </div>
         </div>
      </template>
   </CmsModal>
</template>

<script setup lang="ts">
import { useCmsConfirmState } from '../../composables/cms-confirm'

const state = useCmsConfirmState()

// Settles the pending promise exactly once. Buttons call finish() directly;
// closing via backdrop/escape triggers the modal's after:leave -> finish(false).
// The resolve guard makes whichever fires first win and no-ops the other.
function finish(value: boolean) {
   const resolve = state.value.resolve
   if (!resolve) return
   state.value = { open: false, message: '' }
   resolve(value)
}
</script>
