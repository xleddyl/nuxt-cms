<template>
   <div class="cms-scope cms-canvas cms-grain flex min-h-screen items-center justify-center p-6">
      <div class="flex w-full max-w-sm flex-col gap-8">
         <header class="cms-rise flex flex-col items-center gap-3 text-center">
            <h1 class="cms-display text-(--ui-text-highlighted) text-4xl font-medium">
               {{ t('cms.login.title') }}<span class="text-(--cms-fern)">.</span>
            </h1>
            <p class="text-(--ui-text-muted) text-sm">
               {{ t('cms.login.subtitle') }}
            </p>
         </header>

         <div class="cms-card cms-rise p-6 sm:p-7" style="animation-delay: 90ms">
            <UForm :state="state" class="flex flex-col gap-5" @submit="login">
               <UAlert
                  v-if="error"
                  color="error"
                  variant="subtle"
                  :title="error"
                  class="rounded-xl"
               />
               <UFormField :label="t('cms.login.email')" name="email" required :ui="CMS_FIELD_UI">
                  <UInput
                     v-model="state.email"
                     type="email"
                     size="lg"
                     autocomplete="username"
                     placeholder="you@example.com"
                     class="w-full"
                  />
               </UFormField>
               <UFormField
                  :label="t('cms.login.password')"
                  name="password"
                  required
                  :ui="CMS_FIELD_UI"
               >
                  <UInput
                     v-model="state.password"
                     type="password"
                     size="lg"
                     autocomplete="current-password"
                     placeholder="••••••••"
                     class="w-full"
                  />
               </UFormField>
               <UButton
                  type="submit"
                  :label="t('cms.login.submit')"
                  size="lg"
                  block
                  :loading="loading"
                  class="mt-1 rounded-full"
               />
            </UForm>
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo, ref, useI18n, useUserSession } from '#imports'
import { CMS_FIELD_UI, errorMessage } from '../utils/ui'

definePageMeta({ layout: false })

const { loggedIn, fetch: refreshSession } = useUserSession()
if (loggedIn.value) {
   await navigateTo('/cms', { replace: true })
}

const { t } = useI18n()

const state = ref({ email: '', password: '' })
const error = ref<string | null>(null)
const loading = ref(false)

async function login() {
   loading.value = true
   error.value = null
   try {
      await $fetch('/api/cms/auth/login', { method: 'POST', body: state.value })
      await refreshSession()
      await navigateTo('/cms', { replace: true })
   } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      error.value =
         status === 401 ? t('cms.login.invalid') : errorMessage(e) ?? t('cms.login.failed')
   } finally {
      loading.value = false
   }
}
</script>
