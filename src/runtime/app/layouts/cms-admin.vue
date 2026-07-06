<template>
   <div class="cms-scope cms-canvas cms-grain min-h-screen">
      <div class="flex min-h-screen">
         <aside
            class="border-(--cms-line) sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-7 border-r px-4 py-7"
         >
            <div class="px-3">
               <div class="cms-display text-(--ui-text-highlighted) text-[22px] font-semibold">
                  nuxt<span class="text-(--cms-fern)">·</span>cms
               </div>
               <div class="cms-kicker mt-1.5">
                  {{ t('cms.sidebar.tagline') }}
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
                     <UIcon
                        :name="group.icon"
                        class="cms-navlink-icon text-(--ui-text-dimmed) size-4 shrink-0"
                     />
                     <span class="truncate">{{ link.label }}</span>
                  </NuxtLink>
               </div>
            </nav>

            <div class="border-(--cms-line) flex flex-col gap-3 border-t px-3 pt-5">
               <div class="text-(--ui-text-muted) truncate text-[11px] font-medium">
                  {{ user?.email }}
               </div>
               <UButton
                  :label="t('cms.sidebar.signOut')"
                  icon="i-lucide-log-out"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  class="-ml-2 justify-start rounded-full"
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
   </div>
</template>

<script setup lang="ts">
import type { CmsConfig } from '#nuxt-cms'
import { computed, navigateTo, useI18n, useRoute, useUserSession } from '#imports'
import cmsConfig from '#cms-config'

const route = useRoute()
const { user, clear } = useUserSession()
const { t } = useI18n()

const links = Object.entries(cmsConfig as CmsConfig).map(([name, entry]) => ({
   name,
   label: entry.label,
   kind: entry.kind,
   to: `/cms/${name}`,
}))

const groups = computed(() =>
   [
      {
         title: t('cms.sidebar.collections'),
         icon: 'i-lucide-layers',
         links: links.filter((l) => l.kind === 'collection'),
      },
      {
         title: t('cms.sidebar.singles'),
         icon: 'i-lucide-file-text',
         links: links.filter((l) => l.kind === 'single'),
      },
      {
         title: t('cms.sidebar.library'),
         icon: 'i-lucide-image',
         links: [{ name: 'media', label: t('cms.sidebar.media'), kind: 'media', to: '/cms/media' }],
      },
   ].filter((g) => g.links.length)
)

async function logout() {
   await clear()
   await navigateTo('/cms/login')
}
</script>
