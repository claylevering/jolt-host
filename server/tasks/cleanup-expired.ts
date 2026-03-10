import { getExpiredUploadSlugs, deleteUploadBySlug } from '~/server/utils/db'
import { deleteStorageForSlug } from '~/server/utils/storage'

export default defineTask({
  meta: {
    name: 'cleanup-expired',
    description: 'Delete expired static site uploads from storage and database',
  },
  async run() {
    const slugs = await getExpiredUploadSlugs()
    let deleted = 0
    for (const slug of slugs) {
      try {
        await deleteStorageForSlug(slug)
        if (await deleteUploadBySlug(slug)) deleted++
      } catch (e) {
        console.error(`[cleanup-expired] Failed to delete slug ${slug}:`, e)
      }
    }
    return { result: { deleted, total: slugs.length } }
  },
})
