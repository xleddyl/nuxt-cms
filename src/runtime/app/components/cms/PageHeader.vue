<template>
   <header class="flex items-end justify-between gap-4">
      <div class="flex flex-col gap-2">
         <div class="cms-kicker">
            {{ kicker }}
         </div>
         <div class="flex items-center gap-3">
            <h1 class="cms-display text-(--ui-text-highlighted) text-[32px]/none font-medium">
               {{ title }}
            </h1>
            <slot name="badge" />
         </div>
      </div>
      <slot />
   </header>
</template>

<script setup lang="ts">
defineProps<{
   kicker: string
   title: string
}>()
</script>
