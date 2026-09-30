<template>
   <div class="cms-settings-entry">
      <div class="cms-settings-entry-header">
         <div class="cms-settings-heading">
            <h2 class="cms-title cms-title-sm">Account</h2>
            <p class="cms-settings-hint">Your profile and your password.</p>
         </div>
      </div>

      <div class="cms-account-card">
         <span class="cms-avatar is-lg">{{ initial }}</span>
         <div class="cms-account-text">
            <span class="cms-account-name">{{ displayName }}</span>
            <span class="cms-account-email">{{ email }}</span>
         </div>
         <span class="cms-badge is-muted">{{ isSuperAdmin ? 'Super admin' : 'Admin' }}</span>
      </div>

      <CmsAlert v-if="isSuperAdmin" color="neutral" title="Environment account">
         This account signs in with the credentials of the environment variables
         (NUXT_CMS_ADMIN_EMAIL and NUXT_CMS_ADMIN_PASSWORD). Change them there. Only this account
         can manage users.
      </CmsAlert>

      <template v-else>
         <div class="cms-settings-group">
            <div class="cms-settings-heading">
               <p class="cms-settings-label">Profile</p>
               <p class="cms-settings-hint">The name shows in the sidebar.</p>
            </div>
            <CmsForm :state="profile" @submit="saveProfile">
               <div class="cms-form-row" style="--cms-row-cols: 2">
                  <CmsFormField label="Name" name="name">
                     <CmsInput v-model="profile.name" placeholder="Your name" autocomplete="name" />
                  </CmsFormField>
                  <CmsFormField label="Email" name="email">
                     <CmsInput :model-value="email" disabled />
                  </CmsFormField>
               </div>
               <div class="cms-actions is-end">
                  <CmsButton
                     type="submit"
                     label="Save profile"
                     size="sm"
                     :loading="savingProfile"
                     :disabled="profile.name === (user?.name ?? '')"
                  />
               </div>
            </CmsForm>
         </div>

         <div class="cms-settings-group">
            <div class="cms-settings-heading">
               <p class="cms-settings-label">Password</p>
               <p class="cms-settings-hint">
                  At least {{ MIN_PASSWORD_LENGTH }} characters. Use the sparkle button to generate
                  one.
               </p>
            </div>
            <CmsForm :state="password" @submit="savePassword">
               <CmsAlert v-if="passwordError" color="error" :title="passwordError" />
               <CmsFormField label="Current password" name="current">
                  <CmsPasswordInput
                     v-model="password.current"
                     autocomplete="current-password"
                     placeholder="••••••••"
                  />
               </CmsFormField>
               <CmsFormField label="New password" name="next">
                  <CmsPasswordInput v-model="password.next" generate copy />
               </CmsFormField>
               <div class="cms-actions is-end">
                  <CmsButton
                     type="submit"
                     label="Change password"
                     size="sm"
                     :loading="savingPassword"
                     :disabled="!password.current || password.next.length < MIN_PASSWORD_LENGTH"
                  />
               </div>
            </CmsForm>
         </div>
      </template>
   </div>
</template>

<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import { ref, watch } from '#imports'
import { useCmsAccount } from '../../composables/cms-account'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const { user, email, isSuperAdmin, displayName, initial, refresh } = useCmsAccount()
const toast = useCmsToast()

const profile = ref({ name: user.value?.name ?? '' })
watch(
   () => user.value?.name,
   (name) => {
      profile.value.name = name ?? ''
   }
)

const savingProfile = ref(false)

async function saveProfile() {
   savingProfile.value = true
   try {
      await cmsApi('/api/cms/account', {
         method: 'PUT',
         body: { name: profile.value.name || null },
      })
      await refresh()
      toast.add({ title: 'Profile saved', color: 'success' })
   } catch (error) {
      toast.add({ title: 'Profile not saved', description: errorMessage(error), color: 'error' })
   } finally {
      savingProfile.value = false
   }
}

const password = ref({ current: '', next: '' })
const passwordError = ref<string | null>(null)
const savingPassword = ref(false)

async function savePassword() {
   savingPassword.value = true
   passwordError.value = null
   try {
      await cmsApi('/api/cms/account/password', {
         method: 'PUT',
         body: { currentPassword: password.value.current, newPassword: password.value.next },
      })
      password.value = { current: '', next: '' }
      toast.add({ title: 'Password changed', color: 'success' })
   } catch (error) {
      passwordError.value = errorMessage(error) ?? 'Password not changed.'
   } finally {
      savingPassword.value = false
   }
}
</script>
