<template>
   <select
      :value="model ?? ''"
      :class="['cms-field', `cms-field-${size ?? 'md'}`]"
      @change="model = ($event.target as HTMLSelectElement).value || undefined"
   >
      <option v-if="!required" value="">—</option>
      <option v-for="option in items" :key="option" :value="option">{{ option }}</option>
   </select>
</template>

<script setup lang="ts">
defineProps<{
   items?: string[]
   size?: 'sm' | 'md' | 'lg'
   required?: boolean
}>()

const model = defineModel<string | undefined>()
</script>
