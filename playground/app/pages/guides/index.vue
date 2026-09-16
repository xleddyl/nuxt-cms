<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">{{ page?.title ?? 'Guides' }}</h1>
         <NuxtLink to="/" class="cms-label mt-10 inline-block">back home</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data: page } = await useCmsPage('/guides')
</script>
