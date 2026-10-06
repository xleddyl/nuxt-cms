<template>
   <textarea
      :rows="rows ?? 3"
      :value="model ?? ''"
      :class="['cms-field', 'cms-field-md', { 'is-error': color === 'error' }]"
      @input="model = ($event.target as HTMLTextAreaElement).value"
   />
</template>

<script setup lang="ts">
defineProps<{
   rows?: number
   color?: 'error'
}>()

const model = defineModel<string | null>()
</script>
