<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">Blog</h1>
         <p v-if="!posts.length" class="mt-6 text-(--ui-text-muted)">Nothing published yet.</p>
         <ul class="mt-8 flex flex-col gap-6">
            <li v-for="post in posts" :key="post.id">
               <NuxtLink :to="`/blog/${post.slug}`" class="cms-card flex flex-col gap-2 p-5">
                  <span class="cms-label">
                     {{ post.publishedAt?.slice(0, 10) }}
                     <template v-if="post.author">· {{ post.author.name }}</template>
                  </span>
                  <span class="cms-display text-xl font-semibold">{{ post.title }}</span>
                  <span v-if="post.excerpt" class="text-(--ui-text-muted)">{{ post.excerpt }}</span>
               </NuxtLink>
            </li>
         </ul>
         <NuxtLink to="/" class="cms-label mt-10 inline-block">back home</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data: posts } = await useCmsContents('blog', { limit: 20 })
</script>
