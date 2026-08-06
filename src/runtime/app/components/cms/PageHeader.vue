<template>
   <header class="cms-page-header">
      <div class="cms-page-heading">
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
   title: string
}>()
</script>
