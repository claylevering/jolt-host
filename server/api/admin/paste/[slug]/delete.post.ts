import { getRouterParam } from 'h3'
import { requireAdmin } from '~/server/utils/admin-auth'
import { deleteUploadBySlug, findUploadBySlug } from '~/server/utils/db'
import { deleteStorageForSlug } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  requireAdmin(event)
  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  const row = await findUploadBySlug(slug)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Paste not found' })
  }
  await deleteStorageForSlug(slug)
  await deleteUploadBySlug(slug)
  return { ok: true }
})
