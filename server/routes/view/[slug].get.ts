import { getRouterParam, getQuery, setHeader, sendRedirect } from 'h3'
import mime from 'mime-types'
import { findUploadBySlug } from '~/server/utils/db'
import { getFileFromStorage } from '~/server/utils/storage'
import { isViewAuthorized, setViewAuthCookie, validateUnlockToken } from '~/server/utils/view-auth'
import { verifyPassword } from '~/server/utils/password'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
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

  // Redirect /view/slug → /view/slug/ so relative URLs resolve correctly
  const url = getRequestURL(event)
  if (!url.pathname.endsWith('/')) {
    const location = url.pathname + '/' + (url.search || '')
    setHeader(event, 'Cache-Control', 'public, max-age=60')
    return sendRedirect(event, location, 302)
  }

  const key = row.entry_point
  const blob = await getFileFromStorage(key)
  if (!blob) {
    throw createError({ statusCode: 404, message: 'File not found' })
  }

  const mimeType = mime.lookup(key) || blob.type || 'text/html'
  setHeader(event, 'Content-Type', mimeType)
  return new Uint8Array(await blob.arrayBuffer())
})
