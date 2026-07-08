<template>
   <div class="cms-alert" :class="`cms-alert-${color ?? 'error'}`">
      <p v-if="title" class="font-medium">{{ title }}</p>
      <slot />
   </div>
</template>

<script setup lang="ts">
defineProps<{
   color?: 'error'
   variant?: string
   title?: string
}>()
</script>
