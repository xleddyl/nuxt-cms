<template>
   <CmsModal :open="open" size="sm" title="Welcome to nuxt-cms" @update:open="(v) => !v && keep()">
      <template #body>
         <CmsForm :state="state" @submit="save">
            <p class="cms-settings-hint">
               You signed in with a password that someone shared with you. Set your own password
               now, or keep this one. You can change it later in Settings, Account.
            </p>
            <CmsAlert v-if="error" color="error" :title="error" />
            <CmsFormField label="New password" name="password">
               <CmsPasswordInput v-model="state.password" generate copy />
            </CmsFormField>
            <div class="cms-actions is-end">
               <CmsButton
                  label="Keep current password"
                  variant="ghost"
                  color="neutral"
                  :disabled="busy"
                  @click="keep"
               />
               <CmsButton
                  type="submit"
                  label="Set password"
                  :loading="busy"
                  :disabled="state.password.length < MIN_PASSWORD_LENGTH"
               />
            </div>
         </CmsForm>
      </template>
   </CmsModal>
</template>

<script setup lang="ts">
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { useCmsAccount } from '../../composables/cms-account'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const { user, refresh } = useCmsAccount()
const toast = useCmsToast()

const dismissed = ref(false)
const open = computed(() => !!user.value?.firstLogin && !dismissed.value)

const state = ref({ password: '' })
const error = ref<string | null>(null)
const busy = ref(false)

async function keep() {
   dismissed.value = true
   await cmsApi('/api/cms/account/welcome', { method: 'POST' }).catch(() => undefined)
   await refresh()
}

async function save() {
   busy.value = true
   error.value = null
   try {
      await cmsApi('/api/cms/account/password', {
         method: 'PUT',
         body: { newPassword: state.value.password },
      })
      dismissed.value = true
      await refresh()
      toast.add({ title: 'Password set', color: 'success' })
   } catch (e) {
      error.value = errorMessage(e) ?? 'Password not set.'
   } finally {
      busy.value = false
   }
}
</script>
