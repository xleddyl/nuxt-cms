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
         { 'is-block': block },
      ]"
   >
      <CmsIcon v-if="loading" name="arrow-path" class="size-4 shrink-0 animate-spin" />
      <CmsIcon v-else-if="icon" :name="icon" class="size-4 shrink-0" />
      <slot>{{ label }}</slot>
   </button>
</template>

<script setup lang="ts">
defineProps<{
   label?: string
   type?: 'button' | 'submit' | 'reset'
   form?: string
   icon?: string
   size?: 'xs' | 'sm' | 'md' | 'lg'
   color?: 'primary' | 'neutral' | 'error' | 'success'
   variant?: 'solid' | 'subtle' | 'soft' | 'ghost'
   disabled?: boolean
   loading?: boolean
   block?: boolean
}>()
</script>
