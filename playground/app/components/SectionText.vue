<template>
   <section class="mx-auto w-full max-w-3xl px-6 py-8">
      <h2 v-if="heading" class="cms-display text-2xl font-semibold">{{ heading }}</h2>
      <div class="prose mt-3 text-(--ui-text-muted)" v-html="body" />
   </section>
</template>

<script setup lang="ts">
import type { NewsBodyTextProps } from '#cms-types'

defineProps<NewsBodyTextProps>()
</script>
