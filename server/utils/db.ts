import type { H3Event } from 'h3'
import { useDB } from '~/server/utils/cf'

export type UploadRow = {
  id: string
  slug: string
  entry_point: string
  password_hash: string | null
  owner_token: string | null
  created_at: string
  expires_at: string | null
}

export type UploadListItem = {
  id: string
  slug: string
  entry_point: string
  created_at: string
  expires_at: string | null
  has_password: boolean
}

export type UploadsFilter = {
  dateFrom?: string
  dateTo?: string
  hasPassword?: boolean
  page?: number
  limit?: number
}

export type ApiTokenRow = {
  id: string
  nickname: string
  token_hash: string
  created_at: string
}

// ── Upload operations ───────────────────────────────────────

export async function insertUpload(
  event: H3Event,
  id: string,
  slug: string,
  entryPoint: string,
  passwordHash: string | null = null,
  ownerToken: string | null = null,
  expiresAt: string | null = null
): Promise<void> {
  const db = useDB(event)
  await db
    .prepare(
      "INSERT INTO uploads (id, slug, entry_point, password_hash, owner_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now'), ?)"
    )
    .bind(id, slug, entryPoint, passwordHash, ownerToken, expiresAt)
    .run()
}

export async function findUploadBySlug(event: H3Event, slug: string): Promise<UploadRow | null> {
  const db = useDB(event)
  return await db
    .prepare('SELECT id, slug, entry_point, password_hash, owner_token, created_at, expires_at FROM uploads WHERE slug = ?')
    .bind(slug)
    .first<UploadRow>()
}

export async function slugExists(event: H3Event, slug: string): Promise<boolean> {
  const row = await findUploadBySlug(event, slug)
  return row !== null
}

export async function deleteUploadBySlug(event: H3Event, slug: string): Promise<boolean> {
  const db = useDB(event)
  const result = await db.prepare('DELETE FROM uploads WHERE slug = ?').bind(slug).run()
  return (result.meta?.changes ?? 0) === 1
}

export async function updatePasswordBySlug(event: H3Event, slug: string, passwordHash: string | null): Promise<boolean> {
  const db = useDB(event)
  const result = await db.prepare('UPDATE uploads SET password_hash = ? WHERE slug = ?').bind(passwordHash, slug).run()
  return (result.meta?.changes ?? 0) === 1
}

export async function updatePasswordBySlugAndOwnerToken(
  event: H3Event,
  slug: string,
  ownerToken: string,
  passwordHash: string
): Promise<boolean> {
  const db = useDB(event)
  const result = await db
    .prepare('UPDATE uploads SET password_hash = ? WHERE slug = ? AND owner_token = ?')
    .bind(passwordHash, slug, ownerToken)
    .run()
  return (result.meta?.changes ?? 0) === 1
}

export async function updateExpirationBySlugAndOwnerToken(
  event: H3Event,
  slug: string,
  ownerToken: string,
  expiresAt: string | null
): Promise<boolean> {
  const db = useDB(event)
  const result = await db
    .prepare('UPDATE uploads SET expires_at = ? WHERE slug = ? AND owner_token = ?')
    .bind(expiresAt, slug, ownerToken)
    .run()
  return (result.meta?.changes ?? 0) === 1
}

export async function getExpiredUploadSlugs(event: H3Event): Promise<string[]> {
  const db = useDB(event)
  const result = await db
    .prepare("SELECT slug FROM uploads WHERE expires_at IS NOT NULL AND datetime(expires_at) < datetime('now')")
    .all<{ slug: string }>()
  return (result.results ?? []).map((r) => r.slug)
}

export async function getUploadsPaginated(
  event: H3Event,
  filter: UploadsFilter = {}
): Promise<{ items: UploadListItem[]; total: number; page: number; limit: number }> {
  const db = useDB(event)
  const page = Math.max(1, filter.page ?? 1)
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20))
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (filter.dateFrom) {
    conditions.push('date(created_at) >= date(?)')
    params.push(filter.dateFrom)
  }
  if (filter.dateTo) {
    conditions.push('date(created_at) <= date(?)')
    params.push(filter.dateTo)
  }
  if (filter.hasPassword === true) {
    conditions.push('password_hash IS NOT NULL')
  } else if (filter.hasPassword === false) {
    conditions.push('password_hash IS NULL')
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = await db
    .prepare(`SELECT COUNT(*) as n FROM uploads ${whereClause}`)
    .bind(...params)
    .first<{ n: number }>()
  const total = countRow?.n ?? 0

  const result = await db
    .prepare(
      `SELECT id, slug, entry_point, created_at, expires_at,
        CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password
       FROM uploads ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<UploadRow & { has_password: number }>()

  const items = (result.results ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    entry_point: r.entry_point,
    created_at: r.created_at,
    expires_at: r.expires_at,
    has_password: r.has_password === 1,
  }))

  return { items, total, page, limit }
}

// ── API Token operations ────────────────────────────────────

export async function insertApiToken(event: H3Event, id: string, nickname: string, tokenHash: string): Promise<void> {
  const db = useDB(event)
  await db
    .prepare("INSERT INTO api_tokens (id, nickname, token_hash, created_at) VALUES (?, ?, ?, datetime('now'))")
    .bind(id, nickname, tokenHash)
    .run()
}

export async function findApiTokenByNickname(event: H3Event, nickname: string): Promise<ApiTokenRow | null> {
  const db = useDB(event)
  return await db
    .prepare('SELECT id, nickname, token_hash, created_at FROM api_tokens WHERE nickname = ?')
    .bind(nickname)
    .first<ApiTokenRow>()
}

export async function getAllApiTokens(event: H3Event): Promise<{ id: string; nickname: string; created_at: string }[]> {
  const db = useDB(event)
  const result = await db
    .prepare('SELECT id, nickname, created_at FROM api_tokens ORDER BY created_at DESC')
    .all<ApiTokenRow>()
  return (result.results ?? []).map((r) => ({ id: r.id, nickname: r.nickname, created_at: r.created_at }))
}

export async function deleteApiTokenByNickname(event: H3Event, nickname: string): Promise<boolean> {
  const db = useDB(event)
  const result = await db.prepare('DELETE FROM api_tokens WHERE nickname = ?').bind(nickname).run()
  return (result.meta?.changes ?? 0) === 1
}

export async function findApiTokenByHash(event: H3Event, tokenHash: string): Promise<ApiTokenRow | null> {
  const db = useDB(event)
  return await db
    .prepare('SELECT id, nickname, token_hash, created_at FROM api_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<ApiTokenRow>()
}
