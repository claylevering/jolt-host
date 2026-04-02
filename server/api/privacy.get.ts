import { marked } from 'marked'

export default defineEventHandler(async () => {
  const storage = useStorage('assets:server')
  const md = await storage.getItem('docs:privacy-policy.md') as string || ''
  const html = marked.parse(md) as string
  return { html }
})
