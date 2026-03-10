import { getRouterParam, getQuery, setHeader, sendRedirect } from 'h3'
import { posix } from 'path'
import mime from 'mime-types'
import { findUploadBySlug } from '~/server/utils/db'
import { getFileFromStorage } from '~/server/utils/storage'
import { isViewAuthorized, setViewAuthCookie, validateUnlockToken } from '~/server/utils/view-auth'
import { verifyPassword } from '~/server/utils/password'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  const pathParam = getRouterParam(event, 'path')
  if (!slug) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const row = await findUploadBySlug(slug)
  if (!row) {
    throw createError({ statusCode: 404, message: 'Paste not found' })
  }
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    throw createError({ statusCode: 404, message: 'Paste has expired' })
  }
  if (row.password_hash && !isViewAuthorized(event, slug)) {
    const query = getQuery(event)
    const unlockParam = typeof query.unlock === 'string' ? query.unlock : ''
    const passwordParam = typeof query.password === 'string' ? query.password : ''
    if (unlockParam && validateUnlockToken(slug, unlockParam)) {
      setViewAuthCookie(event, slug)
      return sendRedirect(event, `/view/${slug}/`, 302)
    }
    if (passwordParam && verifyPassword(passwordParam, row.password_hash)) {
      setViewAuthCookie(event, slug)
      return sendRedirect(event, `/view/${slug}/`, 302)
    }
    return sendRedirect(event, `/view/${slug}/unlock`, 302)
  }

  // Compute the R2 key for the requested asset, rooted at the slug prefix.
  // The entry_point is e.g. "quick-apple-42/index.html", so the slug's base dir is "quick-apple-42".
  const slugPrefix = `${slug}/`
  const rawPath = pathParam || ''
  // Normalize to prevent path traversal (e.g. "../../etc/passwd")
  const normalizedPath = posix.normalize(rawPath).replace(/^[./\\]+/, '')
  const key = `${slugPrefix}${normalizedPath}`

  if (!key.startsWith(slugPrefix)) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  // Try the exact key first; if it points to a "directory", try index.html inside it
  let blob = await getFileFromStorage(key)
  if (!blob) {
    const indexKey = key.endsWith('/') ? `${key}index.html` : `${key}/index.html`
    blob = await getFileFromStorage(indexKey)
  }
  if (!blob) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const mimeType = mime.lookup(key) || blob.type || 'application/octet-stream'
  setHeader(event, 'Content-Type', mimeType)
  return new Uint8Array(await blob.arrayBuffer())
})
