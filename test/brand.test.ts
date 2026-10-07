import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
   DEFAULT_BRAND_SUBTITLE,
   DEFAULT_BRAND_TITLE,
   renderBrandFile,
   resolveBrand,
   resolveBrandLogo,
   sanitizeSvg,
} from '../src/brand-codegen'

function project() {
   const rootDir = mkdtempSync(join(tmpdir(), 'cms-brand-'))
   const srcDir = join(rootDir, 'app')
   mkdirSync(join(srcDir, 'assets'), { recursive: true })
   writeFileSync(
      join(srcDir, 'assets', 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20" viewBox="0 0 40 20"><path d="M0 0h40v20z" fill="currentColor"/></svg>'
   )
   writeFileSync(join(rootDir, 'logo.svg'), '<svg viewBox="0 0 8 8"><circle r="4"/></svg>')
   writeFileSync(join(rootDir, 'logo.png'), 'png')
   writeFileSync(join(rootDir, 'broken.svg'), 'not an svg')
   return { rootDir, srcDir }
}

describe('sanitizeSvg', () => {
   it('strips scripts, foreignObject, event handlers and javascript links', () => {
      const out = sanitizeSvg(
         `<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><foreignObject><div>hi</div></foreignObject><a href="javascript:alert(1)"><rect onclick='y()' width="1" height="1"/></a></svg>`
      )
      expect(out).not.toMatch(/script|foreignObject|onload|onclick|javascript:/i)
      expect(out).toContain('<rect')
      expect(out).toContain('viewBox="0 0 10 10"')
   })

   it('drops the xml prolog, doctype and comments', () => {
      const out = sanitizeSvg(
         '<?xml version="1.0"?><!DOCTYPE svg PUBLIC "x" "y"><!-- c --><svg viewBox="0 0 1 1"></svg>'
      )
      expect(out.startsWith('<svg')).toBe(true)
      expect(out).not.toContain('<!--')
   })

   it('removes the fixed width and height of the root and keeps the viewBox', () => {
      const out = sanitizeSvg(
         '<svg width="40" height="20" viewBox="0 0 40 20"><g width="3"/></svg>'
      )
      expect(out.match(/<svg[^>]*>/)?.[0]).toBe('<svg viewBox="0 0 40 20">')
      expect(out).toContain('<g width="3"/>')
   })

   it('builds a viewBox from width and height when there is none', () => {
      const out = sanitizeSvg('<svg width="24px" height="12"></svg>')
      expect(out).toBe('<svg viewBox="0 0 24 12"></svg>')
   })

   it('throws without an svg element', () => {
      expect(() => sanitizeSvg('<div></div>')).toThrow()
   })
})

describe('resolveBrandLogo', () => {
   const paths = project()

   it('uses the default mark without a logo', () => {
      expect(resolveBrandLogo(undefined, paths).logo).toEqual({ kind: 'default' })
      expect(resolveBrandLogo('  ', paths).logo).toEqual({ kind: 'default' })
   })

   it('treats urls and root-relative paths as images', () => {
      expect(resolveBrandLogo('/logo.png', paths).logo).toEqual({ kind: 'image', src: '/logo.png' })
      expect(resolveBrandLogo('/brand/logo.svg', paths).logo).toEqual({
         kind: 'image',
         src: '/brand/logo.svg',
      })
      expect(resolveBrandLogo('https://example.com/a.png', paths).logo).toEqual({
         kind: 'image',
         src: 'https://example.com/a.png',
      })
   })

   it('inlines raw svg markup', () => {
      const { logo, file } = resolveBrandLogo('<svg width="5" height="5"><path/></svg>', paths)
      expect(logo).toEqual({ kind: 'svg', markup: '<svg viewBox="0 0 5 5"><path/></svg>' })
      expect(file).toBeNull()
   })

   it('reads an svg relative to the root dir', () => {
      const { logo, file } = resolveBrandLogo('logo.svg', paths)
      expect(logo.kind).toBe('svg')
      expect(file).toBe(join(paths.rootDir, 'logo.svg'))
   })

   it('reads an svg through the source dir aliases', () => {
      for (const alias of ['~/', '@/']) {
         const { logo } = resolveBrandLogo(`${alias}assets/logo.svg`, paths)
         expect(logo).toMatchObject({ kind: 'svg' })
         expect((logo as { markup: string }).markup).toContain('viewBox="0 0 40 20"')
      }
   })

   it('reads an svg through the root dir aliases', () => {
      expect(resolveBrandLogo('~~/logo.svg', paths).logo.kind).toBe('svg')
      expect(resolveBrandLogo('@@/logo.svg', paths).logo.kind).toBe('svg')
   })

   it('fails for a missing file', () => {
      expect(() => resolveBrandLogo('missing.svg', paths)).toThrow(/does not exist/)
   })

   it('fails for a project file that is not an svg and points to public/', () => {
      expect(() => resolveBrandLogo('logo.png', paths)).toThrow(/public\//)
   })

   it('fails for a file without an svg element', () => {
      expect(() => resolveBrandLogo('broken.svg', paths)).toThrow(/<svg>/)
   })
})

describe('resolveBrand', () => {
   const paths = project()

   it('falls back to the defaults', () => {
      const { brand } = resolveBrand(undefined, paths)
      expect(brand).toEqual({
         title: DEFAULT_BRAND_TITLE,
         subtitle: DEFAULT_BRAND_SUBTITLE,
         logo: { kind: 'default' },
      })
   })

   it('replaces title and subtitle and lets an empty subtitle hide it', () => {
      expect(resolveBrand({ title: ' Acme ', subtitle: 'Studio' }, paths).brand).toMatchObject({
         title: 'Acme',
         subtitle: 'Studio',
      })
      expect(resolveBrand({ subtitle: '' }, paths).brand.subtitle).toBe('')
      expect(resolveBrand({ title: '' }, paths).brand.title).toBe(DEFAULT_BRAND_TITLE)
   })
})

describe('renderBrandFile', () => {
   it('exports the brand as a typed constant', () => {
      const file = renderBrandFile({
         title: 'Acme',
         subtitle: '',
         logo: { kind: 'image', src: '/logo.png' },
      })
      expect(file).toContain('export const cmsBrand')
      expect(file).toContain('"src": "/logo.png"')
   })
})
