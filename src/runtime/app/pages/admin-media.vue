<template>
   <div class="cms-page">
      <CmsPageHeader title="Media">
         <template #badge>
            <span class="cms-badge is-muted">{{ runtime.mediaStorage }}</span>
         </template>
      </CmsPageHeader>

      <CmsMediaGallery />
   </div>
</template>

<script setup lang="ts">
import { definePageMeta } from '#imports'
import { useCmsRuntime } from '../composables/cms-runtime'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })

const runtime = useCmsRuntime()
</script>
