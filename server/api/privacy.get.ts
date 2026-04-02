import { readFileSync } from 'fs'
import { join } from 'path'
import { marked } from 'marked'

export default defineEventHandler(() => {
  let md = readFileSync(join(process.cwd(), 'docs', 'privacy-policy.md'), 'utf-8')

  const supportEmail = process.env.SUPPORT_EMAIL

  if (supportEmail) {
    md = md.replace('{{SUPPORT_EMAIL}}', supportEmail)
  } else {
    // Remove the Contact section (heading, body, and trailing hr) entirely
    md = md.replace(/\n## Contact\n[\s\S]*?\n---\n/, '\n')
  }

  const html = marked.parse(md) as string
  return { html }
})
