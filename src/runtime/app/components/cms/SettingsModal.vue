<template>
   <Teleport to="body">
      <Transition name="cms-modal">
         <div v-if="open" class="cms-scope cms-overlay" @click.self="close">
            <div
               class="cms-modal cms-settings"
               role="dialog"
               aria-modal="true"
               aria-label="Settings"
            >
               <aside class="cms-settings-nav">
                  <CmsButton
                     icon="x-mark"
                     variant="ghost"
                     color="neutral"
                     size="sm"
                     aria-label="Close settings"
                     class="cms-settings-close"
                     @click="close"
                  />
                  <div class="cms-settings-nav-list">
                     <button
                        type="button"
                        class="cms-settings-tab"
                        :class="{ 'is-active': active === 'general' }"
                        @click="active = 'general'"
                     >
                        <CmsIcon name="cog-6-tooth" class="size-4 shrink-0" />
                        General
                     </button>
                     <button
                        type="button"
                        class="cms-settings-tab"
                        :class="{ 'is-active': active === 'account' }"
                        @click="active = 'account'"
                     >
                        <CmsIcon name="user-circle" class="size-4 shrink-0" />
                        Account
                     </button>
                     <button
                        v-if="isSuperAdmin"
                        type="button"
                        class="cms-settings-tab"
                        :class="{ 'is-active': active === 'users' }"
                        @click="active = 'users'"
                     >
                        <CmsIcon name="users" class="size-4 shrink-0" />
                        Users
                     </button>
                     <p class="cms-settings-nav-label">Content</p>
                     <button
                        v-for="item in entries"
                        :key="item.name"
                        type="button"
                        class="cms-settings-tab"
                        :class="{ 'is-active': active === item.key }"
                        @click="active = item.key"
                     >
                        <CmsIcon :name="item.icon" class="size-4 shrink-0" />
                        <span class="truncate">{{ item.label }}</span>
                     </button>
                  </div>
                  <hr class="cms-settings-divider" />
                  <button type="button" class="cms-settings-tab is-danger" @click="emit('logout')">
                     <CmsIcon name="arrow-right-start-on-rectangle" class="size-4 shrink-0" />
                     Sign out
                  </button>
               </aside>

               <section v-if="active === 'account'" class="cms-settings-content">
                  <CmsSettingsAccount />
               </section>
               <section v-else-if="active === 'users'" class="cms-settings-content">
                  <CmsSettingsUsers />
               </section>
               <section v-else-if="activeEntry" class="cms-settings-content">
                  <CmsSettingsEntry :key="activeEntry" :name="activeEntry" />
               </section>
               <section v-else class="cms-settings-content">
                  <h2 class="cms-title cms-title-sm">General</h2>

                  <div class="cms-settings-group">
                     <div class="cms-settings-heading">
                        <p class="cms-settings-label">Theme</p>
                        <p class="cms-settings-hint">
                           Choose how the panel looks. System follows your device.
                        </p>
                     </div>
                     <div class="cms-theme-cards" role="radiogroup" aria-label="Theme">
                        <button
                           v-for="option in CMS_THEMES"
                           :key="option.value"
                           type="button"
                           role="radio"
                           :aria-checked="theme === option.value"
                           class="cms-theme-card"
                           :class="{ 'is-active': theme === option.value }"
                           @click="selectTheme(option.value)"
                        >
                           <span class="cms-theme-preview" :class="`is-${option.value}`">
                              <span
                                 v-for="half in previewHalves(option.value)"
                                 :key="half"
                                 class="cms-theme-preview-app"
                                 :class="`is-${half}`"
                              >
                                 <span class="cms-theme-preview-side" />
                                 <span class="cms-theme-preview-panel">
                                    <span class="cms-theme-preview-line is-accent" />
                                    <span class="cms-theme-preview-line" />
                                    <span class="cms-theme-preview-line is-short" />
                                 </span>
                              </span>
                           </span>
                           <span class="cms-theme-card-label">
                              <CmsIcon :name="option.icon" class="size-3.5" />
                              {{ option.label }}
                              <CmsIcon
                                 v-if="theme === option.value"
                                 name="check"
                                 class="cms-theme-card-check size-3.5"
                              />
                           </span>
                        </button>
                     </div>
                  </div>
               </section>
            </div>
         </div>
      </Transition>
   </Teleport>
</template>

<script setup lang="ts">
import type { CmsEntry, CmsEntryKind } from '#nuxt-cms'
import { computed, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import { CMS_THEMES, setCmsTheme, type CmsTheme } from '../../composables/cms-theme'
import { useCmsAccount } from '../../composables/cms-account'
import { useCmsOverlay } from '../../composables/cms-overlay'

const { isSuperAdmin } = useCmsAccount()

const open = defineModel<boolean>('open', { default: false })
const theme = defineModel<CmsTheme>('theme', { required: true })

const emit = defineEmits<{ logout: [] }>()

const KIND_ICONS: Record<CmsEntryKind, string> = {
   collection: 'square-3-stack-3d',
   single: 'document-text',
   page: 'window',
   content: 'newspaper',
}

const ENTRY_PREFIX = 'entry:'

const entries = Object.entries(cmsConfig as Record<string, CmsEntry>).map(([name, entry]) => ({
   name,
   key: `${ENTRY_PREFIX}${name}`,
   label: entry.label,
   icon: entry.icon ?? KIND_ICONS[entry.kind],
}))

const active = ref('general')

const activeEntry = computed(() =>
   active.value.startsWith(ENTRY_PREFIX) ? active.value.slice(ENTRY_PREFIX.length) : null
)

function selectTheme(value: CmsTheme) {
   setCmsTheme(theme, value)
}

function previewHalves(value: CmsTheme) {
   return value === 'system' ? ['light', 'dark'] : [value]
}

function close() {
   open.value = false
}

const overlay = useCmsOverlay(close)

watch(open, (value) => {
   if (value) overlay.activate()
   else overlay.deactivate()
})
</script>
