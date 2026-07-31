<template>
   <div class="cms-form-field">
      <div v-if="label || $slots['label-actions']" class="cms-form-label-row">
         <label v-if="label" class="cms-form-label">
            {{ label }}<span v-if="required" class="cms-form-required"> *</span>
         </label>
         <slot name="label-actions" />
      </div>
      <slot />
      <p v-if="error" class="cms-form-error">{{ error }}</p>
   </div>
</template>

<script setup lang="ts">
import { computed, inject } from '#imports'
import { CMS_FORM_ERRORS } from '../../utils/ui'

const props = defineProps<{
   label?: string
   name?: string
   required?: boolean
}>()

const errors = inject(CMS_FORM_ERRORS, null)

const error = computed(() => (props.name && errors ? errors[props.name] : undefined))
</script>
