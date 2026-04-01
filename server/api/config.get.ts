import { getConfig } from '~/server/utils/db'

export default defineEventHandler(() => {
  return {
    authEnabled: getConfig('auth_enabled', '0') === '1',
  }
})
