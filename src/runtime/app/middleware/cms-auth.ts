import { defineNuxtRouteMiddleware, navigateTo, useUserSession } from '#imports'

export default defineNuxtRouteMiddleware(() => {
   const { loggedIn } = useUserSession()
   if (!loggedIn.value) {
      return navigateTo('/cms/login')
   }
})
