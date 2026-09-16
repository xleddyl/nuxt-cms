<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">{{ page?.title ?? 'About the club' }}</h1>
         <p v-if="page?.intro" class="mt-4 text-(--ui-text-muted)">{{ page.intro }}</p>
         <img
            v-if="page?.cover?.url"
            :src="page.cover.url"
            :alt="page.cover.alt ?? ''"
            class="mt-8 w-full rounded-xl"
         />
         <NuxtLink to="/" class="cms-label mt-10 inline-block">back home</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data: page } = await useCmsPage('/about')
</script>
