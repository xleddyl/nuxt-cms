<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <article v-if="item" class="py-14">
         <header class="mx-auto w-full max-w-3xl px-6">
            <span class="cms-label">{{ item.publishedAt?.slice(0, 10) }}</span>
            <h1 class="cms-display mt-2 text-4xl font-bold">{{ item.title }}</h1>
            <p v-if="item.excerpt" class="mt-4 text-(--ui-text-muted)">{{ item.excerpt }}</p>
         </header>
         <CmsBlocks :blocks="item.body" />
      </article>
      <div v-else class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">Not found</h1>
      </div>
      <div class="mx-auto w-full max-w-3xl px-6 pb-14">
         <NuxtLink to="/news" class="cms-label">all news</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data: item } = await useCmsContent('news', String(route.params.slug))
</script>
