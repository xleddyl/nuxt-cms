<template>
   <div class="cms-scope cms-canvas min-h-screen">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="cms-display text-4xl font-bold">{{ page?.title ?? 'Knots' }}</h1>
         <NuxtLink to="/guides" class="cms-label mt-10 inline-block">back to guides</NuxtLink>
      </div>
   </div>
</template>

<script setup lang="ts">
const { data: page } = await useCmsPage('/guides/knots')
</script>
