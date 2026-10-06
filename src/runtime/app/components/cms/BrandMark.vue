<template>
   <span class="cms-brand-mark" :class="{ 'is-lg': size === 'lg' }" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
         <path
            d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
         />
      </svg>
   </span>
</template>

<script setup lang="ts">
defineProps<{ size?: 'md' | 'lg' }>()
</script>
