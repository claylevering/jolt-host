import { readFileSync } from 'fs'
import { join } from 'path'
import { marked } from 'marked'

export default defineEventHandler(() => {
  const md = readFileSync(join(process.cwd(), 'docs', 'terms-and-conditions.md'), 'utf-8')
  const html = marked.parse(md) as string
  return { html }
})
