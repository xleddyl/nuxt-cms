<template>
   <figure class="mx-auto w-full max-w-5xl px-6 py-8">
      <img
         v-if="image?.url"
         :src="image.url"
         :alt="image.alt ?? caption ?? ''"
         :width="image.width ?? undefined"
         :height="image.height ?? undefined"
         class="w-full rounded-xl object-cover"
      />
      <figcaption v-if="caption" class="cms-label mt-3 text-center">{{ caption }}</figcaption>
   </figure>
</template>

<script setup lang="ts">
import type { NewsBodyImageProps } from '#cms-types'

defineProps<NewsBodyImageProps>()
</script>
