<template>
   <div class="cms-settings-entry">
      <div class="cms-settings-entry-header">
         <div class="cms-settings-heading">
            <h2 class="cms-title cms-title-sm">Users</h2>
            <p class="cms-settings-hint">
               Users can do everything in the panel, except manage users.
            </p>
         </div>
         <CmsButton
            v-if="!creating"
            label="Add user"
            icon="user-plus"
            size="sm"
            @click="startCreate"
         />
      </div>

      <div v-if="created" class="cms-credentials">
         <div class="cms-settings-heading">
            <p class="cms-settings-label">{{ created.title }}</p>
            <p class="cms-settings-hint">
               Share these credentials with the user. The password does not show again.
            </p>
         </div>
         <dl class="cms-credentials-list">
            <dt>Email</dt>
            <dd>{{ created.email }}</dd>
            <dt>Password</dt>
            <dd class="cms-mono">{{ created.password }}</dd>
         </dl>
         <div class="cms-actions is-end">
            <CmsButton
               :label="copied ? 'Copied' : 'Copy credentials'"
               :icon="copied ? 'clipboard-document-check' : 'clipboard-document'"
               variant="soft"
               size="sm"
               @click="copyCredentials"
            />
            <CmsButton label="Done" size="sm" @click="created = null" />
         </div>
      </div>

      <div v-if="creating" class="cms-credentials">
         <p class="cms-settings-label">New user</p>
         <CmsForm :state="draft" @submit="create">
            <CmsAlert v-if="formError" color="error" :title="formError" />
            <div class="cms-form-row" style="--cms-row-cols: 2">
               <CmsFormField label="Email" name="email" required>
                  <CmsInput
                     v-model="draft.email"
                     type="email"
                     icon="envelope"
                     placeholder="name@example.com"
                     autocomplete="off"
                  />
               </CmsFormField>
               <CmsFormField label="Name" name="name">
                  <CmsInput v-model="draft.name" placeholder="Optional" autocomplete="off" />
               </CmsFormField>
            </div>
            <CmsFormField label="Password" name="password" required>
               <CmsPasswordInput v-model="draft.password" generate copy />
            </CmsFormField>
            <div class="cms-actions is-end">
               <CmsButton
                  label="Cancel"
                  variant="ghost"
                  color="neutral"
                  size="sm"
                  @click="cancel"
               />
               <CmsButton
                  type="submit"
                  label="Create user"
                  size="sm"
                  :loading="busy"
                  :disabled="!draft.email || draft.password.length < MIN_PASSWORD_LENGTH"
               />
            </div>
         </CmsForm>
      </div>

      <CmsSpinner v-if="loading" />

      <ul v-else-if="users.length" class="cms-settings-list">
         <li v-for="account in users" :key="account.id" class="cms-user-row">
            <div class="cms-user-main">
               <span class="cms-avatar">{{ initialOf(account.name, account.email) }}</span>
               <div class="cms-account-text">
                  <span class="cms-account-name">{{ account.name || account.email }}</span>
                  <span class="cms-account-email">
                     {{ account.name ? `${account.email} · ` : '' }}{{ lastLogin(account) }}
                  </span>
               </div>
               <div class="cms-user-actions">
                  <CmsButton
                     icon="key"
                     variant="ghost"
                     color="neutral"
                     size="sm"
                     title="Set a new password"
                     aria-label="Set a new password"
                     @click="startReset(account)"
                  />
                  <CmsButton
                     icon="trash"
                     variant="ghost"
                     color="error"
                     size="sm"
                     title="Delete user"
                     aria-label="Delete user"
                     @click="remove(account)"
                  />
               </div>
            </div>
            <CmsForm
               v-if="resetting === account.id"
               :state="reset"
               class="cms-user-reset"
               @submit="saveReset(account)"
            >
               <CmsFormField label="New password" name="password">
                  <CmsPasswordInput v-model="reset.password" generate copy />
               </CmsFormField>
               <div class="cms-actions is-end">
                  <CmsButton
                     label="Cancel"
                     variant="ghost"
                     color="neutral"
                     size="sm"
                     @click="resetting = null"
                  />
                  <CmsButton
                     type="submit"
                     label="Set password"
                     size="sm"
                     :loading="busy"
                     :disabled="reset.password.length < MIN_PASSWORD_LENGTH"
                  />
               </div>
            </CmsForm>
         </li>
      </ul>

      <CmsEmptyState
         v-else-if="!creating"
         icon="users"
         title="No users yet"
         body="Add a user to give someone access to the panel."
      />
   </div>
</template>

<script setup lang="ts">
import type { CmsAccount } from '#nuxt-cms'
import { MIN_PASSWORD_LENGTH } from '#nuxt-cms'
import { onMounted, ref } from '#imports'
import { generatePassword, initialOf } from '../../composables/cms-account'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsToast } from '../../composables/cms-toast'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const toast = useCmsToast()
const confirmAction = useCmsConfirm()

const users = ref<CmsAccount[]>([])
const loading = ref(true)
const busy = ref(false)

async function load() {
   try {
      users.value = await cmsApi<CmsAccount[]>('/api/cms/users')
   } catch (error) {
      toast.add({ title: 'Could not load users', description: errorMessage(error), color: 'error' })
   } finally {
      loading.value = false
   }
}

onMounted(load)

function lastLogin(account: CmsAccount) {
   if (!account.lastLoginAt) return 'Never signed in'
   return `Last sign-in ${new Date(account.lastLoginAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
   })}`
}

const creating = ref(false)
const draft = ref({ email: '', name: '', password: '' })
const formError = ref<string | null>(null)
const created = ref<{ title: string; email: string; password: string } | null>(null)
const copied = ref(false)

function startCreate() {
   created.value = null
   formError.value = null
   draft.value = { email: '', name: '', password: generatePassword() }
   creating.value = true
}

function cancel() {
   creating.value = false
}

async function create() {
   busy.value = true
   formError.value = null
   try {
      const account = await cmsApi<CmsAccount>('/api/cms/users', {
         method: 'POST',
         body: {
            email: draft.value.email,
            name: draft.value.name || null,
            password: draft.value.password,
         },
      })
      users.value = [...users.value, account]
      created.value = {
         title: 'User created',
         email: account.email,
         password: draft.value.password,
      }
      copied.value = false
      creating.value = false
   } catch (error) {
      formError.value = errorMessage(error) ?? 'User not created.'
   } finally {
      busy.value = false
   }
}

async function copyCredentials() {
   if (!created.value) return
   try {
      await navigator.clipboard.writeText(
         `Email: ${created.value.email}\nPassword: ${created.value.password}`
      )
      copied.value = true
   } catch {
      copied.value = false
   }
}

const resetting = ref<string | null>(null)
const reset = ref({ password: '' })

function startReset(account: CmsAccount) {
   reset.value = { password: generatePassword() }
   resetting.value = resetting.value === account.id ? null : account.id
}

async function saveReset(account: CmsAccount) {
   busy.value = true
   try {
      const updated = await cmsApi<CmsAccount>(`/api/cms/users/${account.id}`, {
         method: 'PUT',
         body: { password: reset.value.password },
      })
      users.value = users.value.map((u) => (u.id === updated.id ? updated : u))
      created.value = {
         title: 'Password changed',
         email: account.email,
         password: reset.value.password,
      }
      copied.value = false
      resetting.value = null
   } catch (error) {
      toast.add({ title: 'Password not changed', description: errorMessage(error), color: 'error' })
   } finally {
      busy.value = false
   }
}

async function remove(account: CmsAccount) {
   if (!(await confirmAction(`Delete ${account.email}? They lose access to the panel.`))) return
   try {
      await cmsApi(`/api/cms/users/${account.id}`, { method: 'DELETE' })
      users.value = users.value.filter((u) => u.id !== account.id)
      toast.add({ title: 'User deleted', color: 'success' })
   } catch (error) {
      toast.add({ title: 'User not deleted', description: errorMessage(error), color: 'error' })
   }
}
</script>
