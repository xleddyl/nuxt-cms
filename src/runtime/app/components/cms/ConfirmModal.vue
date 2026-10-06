<template>
   <CmsModal
      v-model:open="state.open"
      :title="state.title ?? 'Are you sure?'"
      :size="state.groups?.length ? undefined : 'sm'"
      @after:leave="finish(false)"
   >
      <template #body>
         <div class="cms-form">
            <p class="text-sm">{{ state.message }}</p>
            <div v-if="state.groups?.length" class="cms-confirm-groups">
               <section v-for="group in state.groups" :key="group.title" class="cms-confirm-group">
                  <h3 class="cms-confirm-group-title" :title="group.title">{{ group.title }}</h3>
                  <ul class="cms-media-usage-list">
                     <li v-for="link in group.links" :key="link.to + link.meta">
                        <NuxtLink :to="link.to" class="cms-media-usage-link" @click="finish(false)">
                           <span class="cms-media-usage-title">{{ link.title }}</span>
                           <span class="cms-media-usage-meta">{{ link.meta }}</span>
                        </NuxtLink>
                     </li>
                  </ul>
               </section>
            </div>
            <div class="cms-actions is-end">
               <CmsButton label="Cancel" variant="soft" color="neutral" @click="finish(false)" />
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

function finish(value: boolean) {
   const resolve = state.value.resolve
   if (!resolve) return
   state.value = { open: false, message: '' }
   resolve(value)
}
</script>
