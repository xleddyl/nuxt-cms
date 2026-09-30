<template>
   <button
      type="button"
      role="checkbox"
      :aria-checked="indeterminate ? 'mixed' : checked"
      class="cms-checkbox"
      :class="{ 'is-on': checked || indeterminate }"
      @click.stop="emit('toggle')"
   >
      <CmsIcon v-if="indeterminate" name="minus" class="size-3" />
      <CmsIcon v-else-if="checked" name="check" class="size-3" />
   </button>
</template>

<script setup lang="ts">
defineProps<{ checked?: boolean; indeterminate?: boolean }>()

const emit = defineEmits<{ toggle: [] }>()
</script>
