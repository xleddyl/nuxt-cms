<template>
   <UModal
      v-model:open="open"
      :title="title ?? t('cms.confirm.title')"
      :ui="ui"
      @after:leave="emit('after:leave')"
   >
      <template #body>
         <div class="flex flex-col gap-5">
            <p class="text-(--ui-text) text-sm">{{ message }}</p>
            <div class="flex justify-end gap-2">
               <UButton
                  :label="t('cms.confirm.cancel')"
                  variant="subtle"
                  color="neutral"
                  class="rounded-full px-4"
                  @click="emit('close', false)"
               />
               <UButton
                  :label="confirmLabel ?? t('cms.confirm.confirm')"
                  color="error"
                  class="rounded-full px-4"
                  @click="emit('close', true)"
               />
            </div>
         </div>
      </template>
   </UModal>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'
import { CMS_MODAL_UI } from '../../utils/ui'

defineProps<{ message: string; title?: string; confirmLabel?: string }>()

const open = defineModel<boolean>('open', { default: true })

const emit = defineEmits<{ close: [value: boolean]; 'after:leave': [] }>()

const { t } = useI18n()

const ui = { ...CMS_MODAL_UI, content: 'rounded-2xl shadow-xl sm:max-w-md' }
</script>
