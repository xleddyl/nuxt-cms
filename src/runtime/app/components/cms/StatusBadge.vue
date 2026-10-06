<template>
   <span
      class="cms-badge"
      :class="scheduled ? 'is-scheduled' : published ? 'is-published' : 'is-draft'"
      :title="scheduled && at ? `Goes live ${at}` : undefined"
   >
      {{ scheduled ? 'Scheduled' : published ? 'Published' : 'Draft' }}
   </span>
</template>

<script setup lang="ts">
defineProps<{ published?: boolean; scheduled?: boolean; at?: string }>()
</script>
