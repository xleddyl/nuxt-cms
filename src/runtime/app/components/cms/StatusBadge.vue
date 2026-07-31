<template>
   <span class="cms-badge" :class="published ? 'is-published' : 'is-draft'">
      {{ published ? 'Published' : 'Draft' }}
   </span>
</template>

<script setup lang="ts">
defineProps<{ published?: boolean }>()
</script>
