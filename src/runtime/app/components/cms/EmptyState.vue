<template>
   <div class="cms-empty flex flex-col items-center gap-2 p-14 text-center">
      <UIcon :name="icon" class="text-(--cms-fern) mb-1 size-6" />
      <p class="cms-display text-(--ui-text-highlighted) text-xl">
         {{ title }}<span class="text-(--cms-fern)">.</span>
      </p>
      <p v-if="body" class="text-(--ui-text-muted) max-w-md text-sm">
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
}>()
</script>
