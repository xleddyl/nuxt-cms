<template>
   <blockquote class="mx-auto w-full max-w-3xl border-l-2 border-(--cms-line-strong) px-6 py-8">
      <p class="cms-display text-xl italic">{{ text }}</p>
      <footer v-if="author" class="cms-label mt-3">{{ author }}</footer>
   </blockquote>
</template>

<script setup lang="ts">
import type { NewsBodyQuoteProps } from '#cms-types'

defineProps<NewsBodyQuoteProps>()
</script>
