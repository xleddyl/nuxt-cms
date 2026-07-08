<template>
   <form :id="id" @submit.prevent="onSubmit">
      <slot />
   </form>
</template>

<script setup lang="ts">
import { provide, reactive, watch } from '#imports'
import { CMS_FORM_ERRORS } from '../../utils/ui'

interface ParseResult {
   success: boolean
   error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }
}

const props = defineProps<{
   id?: string
   state: Record<string, unknown>
   schema?: { safeParse: (value: unknown) => ParseResult }
}>()

const emit = defineEmits<{ submit: []; error: [] }>()

const errors = reactive<Record<string, string>>({})
provide(CMS_FORM_ERRORS, errors)

let submitted = false

function validate(): boolean {
   for (const key of Object.keys(errors)) delete errors[key]
   if (!props.schema) return true
   const result = props.schema.safeParse(props.state)
   if (result.success) return true
   for (const issue of result.error?.issues ?? []) {
      const key = String(issue.path[0] ?? '')
      if (key && !errors[key]) errors[key] = issue.message
   }
   return false
}

function onSubmit() {
   submitted = true
   if (validate()) emit('submit')
   else emit('error')
}

watch(
   () => props.state,
   () => {
      if (submitted) validate()
   },
   { deep: true }
)
</script>
