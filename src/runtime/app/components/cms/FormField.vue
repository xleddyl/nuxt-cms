<template>
   <div class="flex flex-col gap-1.5">
      <label v-if="label" :class="ui?.label ?? 'text-sm font-medium text-(--ui-text-toned)'">
         {{ label }}<span v-if="required" class="text-(--ui-error)"> *</span>
      </label>
      <slot />
      <p v-if="error" class="text-sm text-(--ui-error)">{{ error }}</p>
   </div>
</template>

<script setup lang="ts">
import { computed, inject } from '#imports'
import { CMS_FORM_ERRORS } from '../../utils/ui'

const props = defineProps<{
   label?: string
   name?: string
   required?: boolean
   ui?: { label?: string }
}>()

const errors = inject(CMS_FORM_ERRORS, null)

const error = computed(() => (props.name && errors ? errors[props.name] : undefined))
</script>
