export default defineNuxtConfig({
   modules: ['@xleddyl/nuxt-cms'],
   devtools: { enabled: true },
   compatibilityDate: '2025-07-15',
   cms: {
      database: {
         driver: 'sqlite',
         path: 'data/cms.db',
      },
      i18n: {
         locales: ['en', 'it'],
         defaultLocale: 'en',
      },
   },
})
