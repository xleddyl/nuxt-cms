<template>
   <div class="cms-rise flex flex-col gap-7">
      <CmsPageHeader kicker="media library" title="Media" />

      <CmsMediaGallery />
   </div>
</template>

<script setup lang="ts">
import { definePageMeta } from '#imports'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })
</script>
