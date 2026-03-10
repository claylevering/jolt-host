import mime from 'mime-types'

/** Stores a file in R2 blob storage under the given key (e.g. "slug/index.html"). */
export async function putFileInStorage(key: string, content: Uint8Array | ArrayBuffer, mimeType?: string): Promise<void> {
  const type = mimeType || mime.lookup(key) || 'application/octet-stream'
  await hubBlob().put(key, content instanceof Uint8Array ? content : new Uint8Array(content), {
    type,
    addRandomSuffix: false,
  })
}

/** Retrieves a file from R2 blob storage. Returns the Blob or null if not found. */
export async function getFileFromStorage(key: string): Promise<Blob | null> {
  return hubBlob().get(key)
}

/** Deletes all files stored for a slug (the entire slug/ prefix in R2). */
export async function deleteStorageForSlug(slug: string): Promise<void> {
  const prefix = `${slug}/`
  let cursor: string | undefined
  do {
    const result = await hubBlob().list({ prefix, cursor, limit: 1000 })
    const pathnames = result.blobs.map((b: { pathname: string }) => b.pathname)
    if (pathnames.length > 0) {
      await hubBlob().delete(pathnames)
    }
    cursor = result.cursor
    if (!result.hasMore) break
  } while (true)
}

