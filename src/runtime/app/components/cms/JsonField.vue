<template>
   <div class="flex flex-col gap-1">
      <CmsTextarea
         v-model="text"
         :rows="6"
         size="lg"
         class="w-full font-mono"
         :color="invalid ? 'error' : undefined"
         @blur="commit"
         @update:model-value="invalid = false"
      />
      <p v-if="invalid" class="text-sm text-(--ui-error)">Invalid JSON</p>
   </div>
</template>

<script setup lang="ts">
import { ref, watch } from '#imports'

const model = defineModel<unknown>({ required: true })

function serialize(value: unknown) {
   return value == null ? '' : JSON.stringify(value, null, 2)
}

function parse(raw: string): unknown {
   if (!raw.trim()) return null
   try {
      return JSON.parse(raw)
   } catch {
      return undefined
   }
}

const text = ref(serialize(model.value))
const invalid = ref(false)

watch(model, (value) => {
   const current = parse(text.value)
   if (JSON.stringify(current ?? null) !== JSON.stringify(value ?? null)) {
      text.value = serialize(value)
      invalid.value = false
   }
})

function commit() {
   const parsed = parse(text.value)
   if (parsed === undefined) {
      invalid.value = true
      return
   }
   invalid.value = false
   model.value = parsed
}
</script>
