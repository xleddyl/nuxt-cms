<template>
   <div class="cms-form-field" :class="{ 'is-error': error }">
      <div v-if="label || $slots['label-actions']" class="cms-form-label-row">
         <label v-if="label" class="cms-form-label">
            <CmsIcon v-if="icon" :name="icon" class="cms-form-label-icon size-3.5" />
            {{ label }}<span v-if="required" class="cms-form-required"> *</span>
         </label>
         <slot name="label-actions" />
      </div>
      <slot />
      <p v-if="description" class="cms-form-description">{{ description }}</p>
      <p v-if="error" class="cms-form-error">
         <CmsIcon name="exclamation-circle" class="size-3.5 shrink-0" />{{ error }}
      </p>
   </div>
</template>

<script setup lang="ts">
import { computed, inject } from '#imports'
import { CMS_FORM_ERRORS } from '../../utils/ui'

const props = defineProps<{
   label?: string
   icon?: string
   description?: string
   name?: string
   required?: boolean
}>()

const errors = inject(CMS_FORM_ERRORS, null)

const error = computed(() => (props.name && errors ? errors[props.name] : undefined))
</script>
