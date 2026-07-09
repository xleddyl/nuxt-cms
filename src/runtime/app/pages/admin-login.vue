<template>
   <div class="cms-scope cms-canvas cms-grain flex min-h-screen items-center justify-center p-6">
      <div class="flex w-full max-w-sm flex-col gap-8">
         <header class="cms-rise flex flex-col items-center gap-3 text-center">
            <h1 class="cms-display text-4xl font-medium text-(--ui-text-highlighted)">
               Welcome back<span class="text-(--cms-fern)">.</span>
            </h1>
            <p class="text-sm text-(--ui-text-muted)">Sign in to manage your content.</p>
         </header>

         <div class="cms-card cms-rise p-6 sm:p-7" style="animation-delay: 90ms">
            <CmsForm :state="state" class="flex flex-col gap-5" @submit="login">
               <CmsAlert
                  v-if="error"
                  color="error"
                  variant="subtle"
                  :title="error"
                  class="rounded-xl"
               />
               <CmsFormField label="Email" name="email" required :ui="CMS_FIELD_UI">
                  <CmsInput
                     v-model="state.email"
                     type="email"
                     size="lg"
                     autocomplete="username"
                     placeholder="you@example.com"
                     class="w-full"
                  />
               </CmsFormField>
               <CmsFormField label="Password" name="password" required :ui="CMS_FIELD_UI">
                  <CmsInput
                     v-model="state.password"
                     type="password"
                     size="lg"
                     autocomplete="current-password"
                     placeholder="••••••••"
                     class="w-full"
                  />
               </CmsFormField>
               <CmsButton
                  type="submit"
                  label="Sign in"
                  size="lg"
                  block
                  :loading="loading"
                  class="mt-1 rounded-full"
               />
            </CmsForm>
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo, ref, useUserSession } from '#imports'
import { CMS_FIELD_UI, errorMessage } from '../utils/ui'

definePageMeta({ layout: false })

const { loggedIn } = useUserSession()
if (loggedIn.value) {
   await navigateTo('/cms', { replace: true })
}

const state = ref({ email: '', password: '' })
const error = ref<string | null>(null)
const loading = ref(false)

async function login() {
   loading.value = true
   error.value = null
   try {
      await $fetch('/api/cms/auth/login', { method: 'POST', body: state.value })
      window.location.replace('/cms')
   } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      error.value =
         status === 401
            ? 'Invalid email or password.'
            : errorMessage(e) ?? 'Login failed. Please try again.'
   } finally {
      loading.value = false
   }
}
</script>
