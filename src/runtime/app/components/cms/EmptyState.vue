<template>
   <div class="cms-empty" :class="{ 'is-fill': fill }">
      <CmsIcon :name="icon" class="cms-empty-icon size-6" />
      <p class="cms-title cms-title-sm">{{ title }}<span class="cms-accent">.</span></p>
      <p v-if="body" class="cms-subtitle max-w-md">
         {{ body }}
      </p>
      <slot />
   </div>
</template>

<script setup lang="ts">
defineProps<{
   icon: string
   title: string
   body?: string
   fill?: boolean
}>()
</script>
