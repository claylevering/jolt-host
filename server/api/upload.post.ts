import { readMultipartFormData, getRequestIP, setResponseHeader } from 'h3'
import { randomUUID, randomBytes } from 'crypto'
import { unzipSync } from 'fflate'
import mime from 'mime-types'
import { insertUpload, slugExists } from '~/server/utils/db'
import { putFileInStorage } from '~/server/utils/storage'
import { generateUniqueSlug } from '~/server/utils/slug'
import { hashPassword } from '~/server/utils/password'
import { createUnlockToken } from '~/server/utils/view-auth'
import { checkUploadRateLimit } from '~/server/utils/rate-limit'
import { isAuthorizedToUpload } from '~/server/utils/upload-auth'

/** Parses expiration form value (1h, 8h, 24h, 1w or empty) to ISO datetime or null. */
function parseExpirationToISO(value: string): string | null {
  if (!value) return null
  const now = Date.now()
  let ms = 0
  const match = value.match(/^(\d+)(h|w|d)$/i)
  if (!match) return null
  const n = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  if (unit === 'h') ms = n * 60 * 60 * 1000
  else if (unit === 'd') ms = n * 24 * 60 * 60 * 1000
  else if (unit === 'w') ms = n * 7 * 24 * 60 * 60 * 1000
  else return null
  return new Date(now + ms).toISOString()
}

export default defineEventHandler(async (event) => {
  if (!(await isAuthorizedToUpload(event))) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'API token required for programmatic uploads. Use the web form at / or provide an API token in the Authorization header.',
    })
  }

  const ip = getRequestIP(event) ?? 'unknown'
  const { allowed, retryAfter } = checkUploadRateLimit(ip)
  if (!allowed) {
    const err = createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${retryAfter ?? 60} seconds.`,
    })
    if (retryAfter) {
      setResponseHeader(event, 'Retry-After', String(retryAfter))
    }
    throw err
  }

  const form = await readMultipartFormData(event)
  if (!form || form.length === 0) {
    throw createError({ statusCode: 400, message: 'No file in request' })
  }

  const file = form.find((f) => f.name === 'file' || f.data)
  if (!file?.data) {
    throw createError({ statusCode: 400, message: 'Missing file' })
  }

  const passwordField = form.find((f) => f.name === 'password' && typeof f.data === 'object')
  const passwordRaw = passwordField?.data
  const password = passwordRaw && Buffer.isBuffer(passwordRaw) ? passwordRaw.toString('utf8').trim() : ''
  const passwordHash = password.length > 0 ? hashPassword(password) : null
  if (password.length > 0 && password.length > 200) {
    throw createError({ statusCode: 400, message: 'Password too long' })
  }

  const expirationField = form.find((f) => f.name === 'expiration' && typeof f.data === 'object')
  const expirationRaw = expirationField?.data
  const expiration = expirationRaw && Buffer.isBuffer(expirationRaw) ? expirationRaw.toString('utf8').trim() : ''
  const expiresAt = parseExpirationToISO(expiration)
  if (expiration && !expiresAt) {
    throw createError({ statusCode: 400, message: 'Invalid expiration value' })
  }

  const filename = (file.filename || 'file').toLowerCase()
  const config = useRuntimeConfig()
  const maxBytes = config.jolthost?.uploadMaxBytes ?? 25 * 1024 * 1024
  const fileSize = Buffer.isBuffer(file.data) ? file.data.length : (file.data as Uint8Array).length
  if (fileSize > maxBytes) {
    throw createError({
      statusCode: 413,
      message: `File too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB.`,
    })
  }

  if (!filename.endsWith('.html') && !filename.endsWith('.zip')) {
    throw createError({ statusCode: 400, message: 'Only .html or .zip files are allowed' })
  }

  const slug = await generateUniqueSlug(slugExists)
  const id = randomUUID()
  const ownerToken = randomBytes(24).toString('base64url')

  let entryPoint: string

  if (filename.endsWith('.html')) {
    const key = `${slug}/index.html`
    const content = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as ArrayBuffer)
    await putFileInStorage(key, content, 'text/html; charset=utf-8')
    entryPoint = key
  } else {
    const buffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data as ArrayBuffer)
    let files: Record<string, Uint8Array>
    try {
      files = unzipSync(new Uint8Array(buffer))
    } catch {
      throw createError({ statusCode: 400, message: 'Invalid or corrupted ZIP file.' })
    }

    const filePaths = Object.keys(files).filter((p) => !p.endsWith('/'))

    const htmlEntries = filePaths
      .filter((p) => p.toLowerCase().endsWith('.html'))
      .map((p) => p.replace(/\\/g, '/').replace(/^\/+/, ''))
      .sort((a, b) => {
        if (a.toLowerCase() === 'index.html') return -1
        if (b.toLowerCase() === 'index.html') return 1
        return a.localeCompare(b)
      })

    const entryFile = htmlEntries[0]
    if (!entryFile) {
      throw createError({ statusCode: 400, message: 'ZIP must contain at least one .html file' })
    }
    entryPoint = `${slug}/${entryFile}`

    await Promise.all(
      filePaths.map((filePath) => {
        const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
        const key = `${slug}/${cleanPath}`
        const mimeType = mime.lookup(filePath) || 'application/octet-stream'
        return putFileInStorage(key, files[filePath]!, mimeType)
      })
    )
  }

  await insertUpload(id, slug, entryPoint, passwordHash, ownerToken, expiresAt)

  const baseUrl = getRequestURL(event).origin
  const url = `${baseUrl}/view/${slug}`
  const response: Record<string, string> = {
    slug,
    url,
    entry_point: entryPoint,
    owner_token: ownerToken,
    url_with_owner_token: `${url}?owner_token=${encodeURIComponent(ownerToken)}`,
  }
  if (password.length > 0) {
    const unlockToken = createUnlockToken(slug, expiresAt)
    response.url_with_unlock = `${url}?unlock=${encodeURIComponent(unlockToken)}`
  }
  return response
})
