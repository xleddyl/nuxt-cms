<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">News</h1>
         <p v-if="!items.length" class="mt-6 text-(--ui-text-muted)">Nothing published yet.</p>
         <ul class="mt-8 flex flex-col gap-6">
            <li v-for="item in items" :key="item.id">
               <NuxtLink :to="`/news/${item.slug}`" class="cms-card flex flex-col gap-2 p-5">
                  <span class="cms-label">{{ item.publishedAt?.slice(0, 10) }}</span>
                  <span class="cms-display text-xl font-semibold">{{ item.title }}</span>
                  <span v-if="item.excerpt" class="text-(--ui-text-muted)">{{ item.excerpt }}</span>
               </NuxtLink>
            </li>
         </ul>
         <NuxtLink to="/" class="cms-label mt-10 inline-block">back home</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data: items } = await useCmsContents('news', { limit: 20 })
</script>
