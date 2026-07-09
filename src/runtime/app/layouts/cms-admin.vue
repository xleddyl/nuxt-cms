<template>
   <div class="cms-scope cms-canvas cms-grain min-h-screen">
      <div class="flex min-h-screen">
         <aside
            class="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-7 border-r border-(--cms-line) px-4 py-7"
         >
            <div class="px-3">
               <div class="cms-display text-[22px] font-semibold text-(--ui-text-highlighted)">
                  nuxt<span class="text-(--cms-fern)">·</span>cms
               </div>
            </div>

            <nav class="flex flex-1 flex-col gap-6 overflow-y-auto">
               <div v-for="group in groups" :key="group.title" class="flex flex-col gap-1">
                  <div class="cms-kicker mb-2 px-3">
                     {{ group.title }}
                  </div>
                  <NuxtLink
                     v-for="link in group.links"
                     :key="link.name"
                     :to="link.to"
                     class="cms-navlink"
                     :class="{ 'is-active': route.path === link.to }"
                  >
                     <CmsIcon
                        :name="group.icon"
                        class="cms-navlink-icon size-4 shrink-0 text-(--ui-text-dimmed)"
                     />
                     <span class="truncate">{{ link.label }}</span>
                  </NuxtLink>
               </div>
            </nav>

            <div class="flex flex-col gap-3 border-t border-(--cms-line) px-3 pt-5">
               <CmsButton
                  label="Sign out"
                  icon="arrow-right-on-rectangle"
                  trailing-icon
                  block
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  class="rounded-full"
                  @click="logout"
               />
            </div>
         </aside>

         <main class="min-w-0 flex-1 px-10 py-10">
            <div class="mx-auto w-full max-w-5xl">
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
