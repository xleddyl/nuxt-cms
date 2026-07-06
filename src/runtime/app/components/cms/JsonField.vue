<template>
   <div class="flex flex-col gap-1">
      <UTextarea
         v-model="text"
         :rows="6"
         size="lg"
         class="w-full font-mono"
         :color="invalid ? 'error' : undefined"
         @blur="commit"
         @update:model-value="invalid = false"
      />
      <p v-if="invalid" class="text-(--ui-error) text-xs">
         {{ t('cms.form.invalidJson') }}
      </p>
   </div>
</template>

<script setup lang="ts">
import { ref, useI18n, watch } from '#imports'

const model = defineModel<unknown>({ required: true })

const { t } = useI18n()

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
