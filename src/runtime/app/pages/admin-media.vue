<template>
   <div class="cms-rise flex flex-col gap-7">
      <CmsPageHeader :kicker="t('cms.media.kicker')" :title="t('cms.media.title')" />

      <CmsMediaGallery />
   </div>
</template>

<script setup lang="ts">
import { definePageMeta, useI18n } from '#imports'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })

const { t } = useI18n()
</script>
