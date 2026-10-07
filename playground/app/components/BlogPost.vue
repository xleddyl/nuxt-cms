<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <article class="py-14">
         <header class="mx-auto w-full max-w-3xl px-6">
            <div class="cms-label flex flex-wrap gap-x-3">
               <span>{{ item.publishedAt?.slice(0, 10) }}</span>
               <span v-if="item.readingTime">{{ item.readingTime }} min read</span>
            </div>
            <h1 class="cms-display mt-2 text-4xl font-bold">{{ item.title }}</h1>
            <p v-if="item.excerpt" class="mt-4 text-(--ui-text-muted)">{{ item.excerpt }}</p>
         </header>
         <figure v-if="item.cover?.url" class="mx-auto mt-8 w-full max-w-5xl px-6">
            <img
               :src="item.cover.url"
               :alt="item.cover.alt ?? ''"
               class="aspect-[21/9] w-full rounded-xl object-cover"
            />
         </figure>
         <slot />
      </article>
      <slot name="footer" />
   </div>
</template>

<script setup lang="ts">
import type { Blog } from '#cms-types'

defineProps<{
   item: Pick<Blog, 'title' | 'excerpt' | 'publishedAt' | 'cover' | 'readingTime'>
   locale?: string
}>()
</script>
