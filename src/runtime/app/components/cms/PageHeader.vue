<template>
   <header class="cms-page-header">
      <div class="cms-page-heading">
         <nav v-if="links?.length" class="cms-breadcrumb">
            <template v-for="link in links" :key="link.to">
               <NuxtLink :to="link.to" class="cms-breadcrumb-link">{{ link.label }}</NuxtLink>
               <CmsIcon name="chevron-right" class="cms-breadcrumb-separator size-2.5" />
            </template>
         </nav>
         <div class="cms-actions">
            <h1 class="cms-title cms-title-md">
               {{ title }}
            </h1>
            <slot name="badge" />
         </div>
      </div>
      <slot />
   </header>
</template>

<script setup lang="ts">
export interface CmsBreadcrumbLink {
   label: string
   to: string
}

defineProps<{
   title: string
   links?: CmsBreadcrumbLink[]
}>()
</script>
