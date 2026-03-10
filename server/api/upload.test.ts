import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { unzipSync } from 'fflate'

const FIXTURES = join(process.cwd(), 'test', 'fixtures')

describe('upload API fixtures', () => {
  it('dummy.html exists and is valid HTML', () => {
    const html = readFileSync(join(FIXTURES, 'dummy.html'), 'utf-8')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Dummy Test Site')
  })

  it('dummy-site.zip exists and contains index.html', () => {
    const zipBuffer = readFileSync(join(FIXTURES, 'dummy-site.zip'))
    const files = unzipSync(new Uint8Array(zipBuffer))
    const htmlFiles = Object.keys(files).filter(
      (p) => !p.endsWith('/') && p.toLowerCase().endsWith('.html')
    )
    expect(htmlFiles).toContain('index.html')
  })
})
