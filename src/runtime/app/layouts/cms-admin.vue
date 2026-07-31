<template>
   <div class="cms-scope cms-canvas cms-grain min-h-screen">
      <div class="cms-shell">
         <aside class="cms-sidebar">
            <div class="cms-sidebar-brand">nuxt<span class="cms-accent">·</span>cms</div>

            <nav class="cms-sidebar-nav">
               <div v-for="group in groups" :key="group.title" class="cms-sidebar-group">
                  <div class="cms-kicker">
                     {{ group.title }}
                  </div>
                  <NuxtLink
                     v-for="link in group.links"
                     :key="link.name"
                     :to="link.to"
                     class="cms-navlink"
                     :class="{ 'is-active': route.path === link.to }"
                  >
                     <CmsIcon :name="group.icon" class="cms-navlink-icon size-4 shrink-0" />
                     <span class="truncate">{{ link.label }}</span>
                  </NuxtLink>
               </div>
            </nav>

            <div class="cms-sidebar-footer">
               <CmsButton
                  label="Sign out"
                  icon="arrow-right-on-rectangle"
                  trailing-icon
                  block
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="logout"
               />
            </div>
         </aside>

         <main class="cms-main">
            <div class="cms-main-inner">
               <slot />
            </div>
         </main>
      </div>

      <CmsToaster />
      <CmsConfirmModal />
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { computed, navigateTo, useRoute, useUserSession } from '#imports'
import cmsConfig from '#cms-config'

const route = useRoute()
const { clear } = useUserSession()

const links = Object.entries(cmsConfig as CmsConfig).map(([name, entry]) => ({
   name,
   label: entry.label,
   kind: entry.kind,
   to: `/cms/${name}`,
}))

const groups = computed(() =>
   [
      {
         title: 'Collections',
         icon: 'square-3-stack-3d',
         links: links.filter((l) => l.kind === 'collection'),
      },
      {
         title: 'Singles',
         icon: 'document-text',
         links: links.filter((l) => l.kind === 'single'),
      },
      {
         title: 'Library',
         icon: 'photo',
         links: [{ name: 'media', label: 'Media', kind: 'media', to: '/cms/media' }],
      },
   ].filter((g) => g.links.length)
)

async function logout() {
   await clear()
   await navigateTo('/cms/login')
}
</script>
