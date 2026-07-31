<template>
   <button
      :type="type ?? 'button'"
      :form="form"
      :disabled="disabled || loading"
      :class="[
         'cms-btn',
         `cms-btn-${size ?? 'md'}`,
         `cms-btn-${color ?? 'primary'}`,
         `cms-btn-${variant ?? 'solid'}`,
         { 'is-block': block, 'is-icon': iconOnly },
      ]"
   >
      <CmsIcon
         v-if="iconName && !trailingIcon"
         :name="iconName"
         class="size-4 shrink-0"
         :class="{ 'animate-spin': loading }"
      />
      <slot>{{ label }}</slot>
      <CmsIcon
         v-if="iconName && trailingIcon"
         :name="iconName"
         class="size-4 shrink-0"
         :class="{ 'animate-spin': loading }"
      />
   </button>
</template>

<script setup lang="ts">
import { computed, useSlots } from '#imports'

const props = defineProps<{
   label?: string
   type?: 'button' | 'submit' | 'reset'
   form?: string
   icon?: string
   // Render the icon after the label instead of before it.
   trailingIcon?: boolean
   size?: 'xs' | 'sm' | 'md' | 'lg'
   color?: 'primary' | 'neutral' | 'error' | 'success'
   variant?: 'solid' | 'subtle' | 'soft' | 'ghost'
   disabled?: boolean
   loading?: boolean
   block?: boolean
}>()

// The spinner takes over the icon slot while loading, keeping its leading/trailing position.
const iconName = computed(() => (props.loading ? 'arrow-path' : props.icon))

const slots = useSlots()

const iconOnly = computed(() => !props.label && !props.block && !slots.default)
</script>
