<template>
   <header class="cms-page-header">
      <div class="cms-page-heading">
         <div v-if="kicker" class="cms-kicker">
            {{ kicker }}
         </div>
         <div class="cms-actions">
            <h1 class="cms-title cms-title-md">
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
   kicker?: string
   title: string
}>()
</script>
