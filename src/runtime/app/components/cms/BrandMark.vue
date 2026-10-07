<template>
   <span
      v-if="cmsBrand.logo.kind === 'svg'"
      class="cms-brand-logo"
      :class="{ 'is-lg': size === 'lg' }"
      aria-hidden="true"
      v-html="cmsBrand.logo.markup"
   />
   <img
      v-else-if="cmsBrand.logo.kind === 'image'"
      class="cms-brand-logo"
      :class="{ 'is-lg': size === 'lg' }"
      :src="cmsBrand.logo.src"
      :alt="cmsBrand.title"
   />
   <span v-else class="cms-brand-mark" :class="{ 'is-lg': size === 'lg' }" aria-hidden="true">
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
import { cmsBrand } from '#cms-brand'

defineProps<{ size?: 'md' | 'lg' }>()
</script>
