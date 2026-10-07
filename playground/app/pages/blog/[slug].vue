<template>
   <BlogPost v-if="post" :item="post">
      <CmsBlocks :blocks="post.body" />
      <template #footer>
         <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pb-14">
            <p v-if="post.author" class="text-sm text-(--ui-text-muted)">
               Written by {{ post.author.name }}
            </p>
            <NuxtLink to="/blog" class="cms-label">all posts</NuxtLink>
         </div>
      </template>
   </BlogPost>
   <div v-else class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">Not found</h1>
         <NuxtLink to="/blog" class="cms-label mt-6 inline-block">all posts</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { data: post } = await useCmsContent('blog', String(route.params.slug))
</script>
