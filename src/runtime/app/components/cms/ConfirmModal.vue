<template>
   <CmsModal
      v-model:open="state.open"
      :title="state.title ?? 'Are you sure?'"
      :ui="ui"
      @after:leave="finish(false)"
   >
      <template #body>
         <div class="flex flex-col gap-5">
            <p class="text-sm text-(--ui-text)">{{ state.message }}</p>
            <div class="flex justify-end gap-2">
               <CmsButton
                  label="Cancel"
                  variant="subtle"
                  color="neutral"
                  class="rounded-full px-4"
                  @click="finish(false)"
               />
               <CmsButton
                  :label="state.confirmLabel ?? 'Confirm'"
                  color="error"
                  class="rounded-full px-4"
                  @click="finish(true)"
               />
            </div>
         </div>
      </template>
   </CmsModal>
</template>

<script setup lang="ts">
import { useCmsConfirmState } from '../../composables/cms-confirm'
import { CMS_MODAL_UI } from '../../utils/ui'

const state = useCmsConfirmState()

const ui = { ...CMS_MODAL_UI, content: 'rounded-2xl shadow-xl sm:max-w-md' }

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
