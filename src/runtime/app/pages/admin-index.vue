<template>
   <div />
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo } from '#imports'
import cmsConfig from '#cms-config'

definePageMeta({ layout: 'cms-admin', middleware: 'cms-auth' })

const first = Object.keys(cmsConfig)[0]
await navigateTo(first ? `/cms/${first}` : '/cms/media', { replace: true })
</script>
