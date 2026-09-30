<template>
   <span class="cms-brand-mark" :class="{ 'is-lg': size === 'lg' }" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
         <path
            d="M4.25 12.25V7.5a3.75 3.75 0 0 1 7.5 0v4.75"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
         />
         <circle cx="8" cy="12.25" r="1.25" fill="currentColor" />
      </svg>
   </span>
</template>

<script setup lang="ts">
defineProps<{ size?: 'md' | 'lg' }>()
</script>
