<template>
   <div class="cms-scope cms-canvas min-h-screen" :data-theme="theme">
      <div class="cms-shell" :class="{ 'is-nav-open': navOpen }">
         <aside class="cms-sidebar">
            <div class="cms-sidebar-brand">
               <CmsBrandMark />
               <div class="cms-brand-text">
                  <span class="cms-brand-name">{{ cmsBrand.title }}</span>
                  <span v-if="cmsBrand.subtitle" class="cms-brand-meta">{{
                     cmsBrand.subtitle
                  }}</span>
               </div>
            </div>

            <CmsSearch @open="navOpen = false" />

            <nav class="cms-sidebar-nav">
               <div v-for="group in groups" :key="group.title" class="cms-sidebar-group">
                  <div class="cms-label">
                     {{ group.title }}
                  </div>
                  <NuxtLink
                     v-for="link in group.links"
                     :key="link.name"
                     :to="link.to"
                     class="cms-navlink"
                     :class="{ 'is-active': isActive(link.to) }"
                  >
                     <CmsIcon
                        :name="link.icon ?? group.icon"
                        class="cms-navlink-icon size-4 shrink-0"
                     />
                     <span class="truncate">{{ link.label }}</span>
                  </NuxtLink>
               </div>
            </nav>

            <div class="cms-sidebar-footer">
               <button
                  type="button"
                  class="cms-account"
                  :class="{ 'is-open': settingsOpen }"
                  aria-label="Open settings"
                  @click="openSettings"
               >
                  <span class="cms-avatar">{{ initial }}</span>
                  <span class="cms-account-text">
                     <span class="cms-account-name">{{ displayName }}</span>
                     <span class="cms-account-email" :title="email">{{ email }}</span>
                  </span>
                  <CmsIcon name="ellipsis-horizontal" class="cms-account-more size-4" />
               </button>
            </div>
         </aside>

         <div class="cms-sidebar-scrim" @click="navOpen = false" />

         <main class="cms-main">
            <header class="cms-topbar">
               <CmsButton
                  icon="bars-3"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  aria-label="Open navigation"
                  @click="navOpen = true"
               />
               <CmsBrandMark />
               <span class="cms-brand-name">{{ cmsBrand.title }}</span>
            </header>
            <div class="cms-main-inner">
               <slot />
            </div>
         </main>
      </div>

      <CmsSettingsModal v-model:open="settingsOpen" v-model:theme="theme" @logout="logout" />
      <CmsWelcomeModal />
      <CmsToaster />
      <CmsConfirmModal />
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { computed, navigateTo, ref, useRoute, useUserSession, watch } from '#imports'
import cmsConfig from '#cms-config'
import { cmsBrand } from '#cms-brand'
import { useCmsTheme } from '../composables/cms-theme'
import { useCmsAccount } from '../composables/cms-account'
import { loadCmsSettings } from '../composables/cms-settings'

const route = useRoute()
const { clear } = useUserSession()
const { email, displayName, initial } = useCmsAccount()
const theme = useCmsTheme()
const navOpen = ref(false)
const settingsOpen = ref(false)

await loadCmsSettings()

const links = Object.entries(cmsConfig as CmsConfig).map(([name, entry]) => ({
   name,
   label: entry.label,
   kind: entry.kind,
   icon: entry.icon,
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
         title: 'Content',
         icon: 'newspaper',
         links: links.filter((l) => l.kind === 'content'),
      },
      {
         title: 'Pages',
         icon: 'window',
         links: links.filter((l) => l.kind === 'page'),
      },
      {
         title: 'Library',
         icon: 'photo',
         links: [
            { name: 'media', label: 'Media', kind: 'media', icon: undefined, to: '/cms/media' },
         ],
      },
   ].filter((g) => g.links.length)
)

function isActive(to: string) {
   return route.path === to || route.path.startsWith(`${to}/`)
}

watch(
   () => route.fullPath,
   () => {
      navOpen.value = false
   }
)

function openSettings() {
   navOpen.value = false
   settingsOpen.value = true
}

async function logout() {
   settingsOpen.value = false
   await clear()
   await navigateTo('/cms/login')
}
</script>
