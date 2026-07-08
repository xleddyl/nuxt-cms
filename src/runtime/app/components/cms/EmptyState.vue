<template>
   <div class="cms-empty flex flex-col items-center gap-2 p-14 text-center">
      <CmsIcon :name="icon" class="mb-1 size-6 text-(--cms-fern)" />
      <p class="cms-display text-xl text-(--ui-text-highlighted)">
         {{ title }}<span class="text-(--cms-fern)">.</span>
      </p>
      <p v-if="body" class="max-w-md text-sm text-(--ui-text-muted)">
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
