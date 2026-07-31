export const CMS_ENABLED_ENV = 'NUXT_CMS_ENABLED'

export function resolveCmsEnabled(
   explicit: boolean | undefined,
   envValue: string | undefined
): boolean {
   if (typeof explicit === 'boolean') return explicit
   if (typeof envValue === 'string') {
      const normalized = envValue.trim().toLowerCase()
      return normalized === '1' || normalized === 'true'
   }
   return true
}
