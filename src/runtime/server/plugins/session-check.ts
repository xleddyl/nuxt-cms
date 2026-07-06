import { useRuntimeConfig } from '#imports'

export default () => {
   const { session } = useRuntimeConfig() as { session?: { password?: string } }
   if (!session?.password || session.password.length < 32) {
      throw new Error(
         '[nuxt-cms] Admin sessions require NUXT_SESSION_PASSWORD (min 32 characters) in production'
      )
   }
}
