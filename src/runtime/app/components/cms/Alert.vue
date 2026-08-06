<template>
   <div class="cms-alert" :class="`cms-alert-${color ?? 'neutral'}`" role="alert">
      <p v-if="title" class="cms-alert-title">{{ title }}</p>
      <slot />
   </div>
</template>

<script setup lang="ts">
defineProps<{
   color?: 'error' | 'success' | 'warning' | 'neutral'
   title?: string
}>()
</script>
