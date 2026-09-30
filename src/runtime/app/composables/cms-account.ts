import type { CmsSessionUser } from '#nuxt-cms'
import { computed, useUserSession } from '#imports'

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

export function generatePassword(length = 16): string {
   const values = new Uint32Array(length)
   crypto.getRandomValues(values)
   return Array.from(values, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join(
      ''
   )
}

export function initialOf(name: string | null | undefined, email: string) {
   return (name?.trim() || email).charAt(0).toUpperCase() || 'A'
}

export function useCmsAccount() {
   const session = useUserSession()
   const user = computed(() => (session.user.value ?? null) as CmsSessionUser | null)
   const email = computed(() => user.value?.email ?? '')
   const isSuperAdmin = computed(() => !!user.value && !user.value.id)
   const displayName = computed(
      () => user.value?.name?.trim() || (isSuperAdmin.value ? 'Super admin' : email.value)
   )
   const initial = computed(() => initialOf(user.value?.name, email.value))
   return { user, email, isSuperAdmin, displayName, initial, refresh: session.fetch }
}
