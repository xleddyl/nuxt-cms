import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
   modules: ['@xleddyl/nuxt-cms'],
   devtools: { enabled: true },
   compatibilityDate: '2025-07-15',
   css: ['~/assets/css/main.css'],
   vite: {
      plugins: [tailwindcss()],
   },
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
