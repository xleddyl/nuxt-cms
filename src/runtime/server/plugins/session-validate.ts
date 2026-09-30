import { createError } from 'h3'
import { clearUserSession, sessionHooks } from '#imports'
import { findUserById, passwordStamp } from '../utils/users'

export default () => {
   sessionHooks.hook('fetch', async (session, event) => {
      const user = session.user
      if (!user?.id) return
      const row = await findUserById(user.id)
      if (row && user.passwordStamp === passwordStamp(row.passwordHash)) return
      await clearUserSession(event)
      throw createError({ statusCode: 401, statusMessage: 'Session expired' })
   })
}
