<template>
   <div class="cms-empty" :class="{ 'is-fill': fill }">
      <span class="cms-empty-icon">
         <CmsIcon :name="icon" class="size-5" />
      </span>
      <p class="cms-title cms-title-sm">{{ title }}</p>
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
