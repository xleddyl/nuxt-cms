<template>
   <div class="cms-page">
      <CmsPageHeader
         title="Media"
         icon="photo"
         description="Images, videos and files used across your content."
      >
         <template #badge>
            <span class="cms-badge is-muted">{{ runtime.mediaStorage }}</span>
         </template>
      </CmsPageHeader>

      <CmsMediaGallery v-model:folder="folder" />
   </div>
</template>

<script setup lang="ts">
import { computed, definePageMeta, navigateTo, useRoute } from '#imports'
import { normalizeMediaFolder } from '#nuxt-cms'
import { useCmsRuntime } from '../composables/cms-runtime'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })

const runtime = useCmsRuntime()
const route = useRoute()

const folder = computed<string | null>({
   get: () => {
      const value = route.query.folder
      return normalizeMediaFolder(typeof value === 'string' ? value : null)
   },
   set: (value) => {
      const { folder: _folder, ...query } = route.query
      void navigateTo({ query: value ? { ...query, folder: value } : query })
   },
})
</script>
