<template>
   <div class="cms-scope cms-canvas cms-auth">
      <div class="cms-auth-panel cms-rise">
         <header class="cms-auth-header">
            <h1 class="cms-title cms-title-lg">Welcome back<span class="cms-accent">.</span></h1>
            <p class="cms-subtitle">Sign in to manage your content.</p>
         </header>

         <div class="cms-card cms-auth-card">
            <CmsForm :state="state" @submit="login">
               <CmsAlert v-if="error" color="error" :title="error" />
               <CmsFormField label="Email" name="email" required>
                  <CmsInput
                     v-model="state.email"
                     type="email"
                     autocomplete="username"
                     placeholder="you@example.com"
                  />
               </CmsFormField>
               <CmsFormField label="Password" name="password" required>
                  <CmsInput
                     v-model="state.password"
                     type="password"
                     autocomplete="current-password"
                     placeholder="••••••••"
                  />
               </CmsFormField>
               <CmsButton type="submit" label="Sign in" block :loading="loading" />
            </CmsForm>
         </div>
      </div>
   </div>
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo, ref, useUserSession } from '#imports'
import { errorMessage } from '../utils/ui'

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
