<template>
   <CmsInput
      v-model="model"
      :type="visible ? 'text' : 'password'"
      icon="key"
      class="cms-password-input"
      :autocomplete="autocomplete ?? 'new-password'"
      :placeholder="placeholder"
   >
      <template #trailing>
         <span class="cms-password-actions">
            <button
               type="button"
               class="cms-password-action"
               :title="visible ? 'Hide password' : 'Show password'"
               :aria-label="visible ? 'Hide password' : 'Show password'"
               @click="visible = !visible"
            >
               <CmsIcon :name="visible ? 'eye-slash' : 'eye'" class="size-4" />
            </button>
            <button
               v-if="generate"
               type="button"
               class="cms-password-action"
               title="Generate a password"
               aria-label="Generate a password"
               @click="regenerate"
            >
               <CmsIcon name="sparkles" class="size-4" />
            </button>
            <button
               v-if="copy"
               type="button"
               class="cms-password-action"
               :class="{ 'is-done': copied }"
               :title="copied ? 'Copied' : 'Copy password'"
               :aria-label="copied ? 'Copied' : 'Copy password'"
               :disabled="!model"
               @click="copyPassword"
            >
               <CmsIcon
                  :name="copied ? 'clipboard-document-check' : 'clipboard-document'"
                  class="size-4"
               />
            </button>
         </span>
      </template>
   </CmsInput>
</template>

<script setup lang="ts">
import { ref } from '#imports'
import { generatePassword } from '../../composables/cms-account'

defineProps<{
   generate?: boolean
   copy?: boolean
   placeholder?: string
   autocomplete?: string
}>()

const model = defineModel<string>({ required: true })

const visible = ref(false)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

function regenerate() {
   model.value = generatePassword()
   visible.value = true
}

async function copyPassword() {
   if (!model.value) return
   await navigator.clipboard.writeText(model.value)
   copied.value = true
   clearTimeout(copiedTimer)
   copiedTimer = setTimeout(() => {
      copied.value = false
   }, 1600)
}
</script>
