import { requireAdmin } from '~/server/utils/admin-auth'
import { getConfig } from '~/server/utils/db'

export default defineEventHandler((event) => {
  requireAdmin(event)
  return {
    authEnabled: getConfig('auth_enabled', '0') === '1',
  }
})
