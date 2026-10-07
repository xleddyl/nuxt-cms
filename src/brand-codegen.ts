import { existsSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'

export const DEFAULT_BRAND_TITLE = 'nuxt-cms'
export const DEFAULT_BRAND_SUBTITLE = 'Content studio'

export type BrandLogo =
   | { kind: 'default' }
   | { kind: 'image'; src: string }
   | { kind: 'svg'; markup: string }

export interface BrandOptions {
   title?: string
   subtitle?: string
   logo?: string
}

export interface ResolvedBrand {
   title: string
   subtitle: string
   logo: BrandLogo
}

export interface BrandPaths {
   rootDir: string
   srcDir: string
}

export interface ResolvedBrandLogo {
   logo: BrandLogo
   file: string | null
}

const ROOT_ALIASES = ['~~/', '@@/']
const SRC_ALIASES = ['~/', '@/']

export function sanitizeSvg(markup: string): string {
   let svg = markup
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/>/gi, '')
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
      .replace(/<foreignObject\b[^>]*\/>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(?:xlink:)?href\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '')
      .trim()
   const start = svg.search(/<svg\b/i)
   if (start === -1) throw new Error('no <svg> element found')
   svg = svg.slice(start)
   return svg.replace(/<svg\b[^>]*>/i, (tag) => normalizeRootTag(tag))
}

function normalizeRootTag(tag: string): string {
   const attribute = (name: string) =>
      tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
   const width = parseFloat(attribute('width')?.[1] ?? attribute('width')?.[2] ?? '')
   const height = parseFloat(attribute('height')?.[1] ?? attribute('height')?.[2] ?? '')
   let next = tag.replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
   if (!attribute('viewBox') && width > 0 && height > 0) {
      next = next.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`)
   }
   return next
}

function isPublicReference(logo: string): boolean {
   return /^(?:https?:)?\/\//i.test(logo) || /^data:image\//i.test(logo) || logo.startsWith('/')
}

function projectFile(logo: string, paths: BrandPaths): string {
   const rooted = ROOT_ALIASES.find((alias) => logo.startsWith(alias))
   if (rooted) return resolve(paths.rootDir, logo.slice(rooted.length))
   const sourced = SRC_ALIASES.find((alias) => logo.startsWith(alias))
   if (sourced) return resolve(paths.srcDir, logo.slice(sourced.length))
   return isAbsolute(logo) ? logo : resolve(paths.rootDir, logo)
}

export function resolveBrandLogo(logo: string | undefined, paths: BrandPaths): ResolvedBrandLogo {
   const value = logo?.trim() ?? ''
   if (!value) return { logo: { kind: 'default' }, file: null }

   if (/^<svg[\s>]/i.test(value)) {
      return { logo: { kind: 'svg', markup: sanitizeSvgOption(value, 'admin.logo') }, file: null }
   }

   if (isPublicReference(value)) {
      return { logo: { kind: 'image', src: value }, file: null }
   }

   const file = projectFile(value, paths)
   if (!existsSync(file)) {
      throw new Error(
         `[nuxt-cms] admin.logo (${value}) points to a file that does not exist: ${file}. Use a path to an .svg file in the project, a public path such as '/logo.png', a URL, or inline <svg> markup.`
      )
   }
   if (extname(file).toLowerCase() !== '.svg') {
      throw new Error(
         `[nuxt-cms] admin.logo (${value}) is not an .svg file. Only SVG files are read from the project: put the image in public/ and use its public path, for example '/${file
            .split(/[\\/]/)
            .pop()}'.`
      )
   }
   return {
      logo: { kind: 'svg', markup: sanitizeSvgOption(readFileSync(file, 'utf8'), value) },
      file,
   }
}

function sanitizeSvgOption(markup: string, source: string): string {
   try {
      return sanitizeSvg(markup)
   } catch {
      throw new Error(`[nuxt-cms] admin.logo (${source}) does not contain an <svg> element.`)
   }
}

export function resolveBrand(
   options: BrandOptions | undefined,
   paths: BrandPaths
): { brand: ResolvedBrand; file: string | null } {
   const { logo, file } = resolveBrandLogo(options?.logo, paths)
   return {
      brand: {
         title: options?.title?.trim() || DEFAULT_BRAND_TITLE,
         subtitle:
            options?.subtitle === undefined ? DEFAULT_BRAND_SUBTITLE : options.subtitle.trim(),
         logo,
      },
      file,
   }
}

export function renderBrandFile(brand: ResolvedBrand): string {
   return [
      `export const cmsBrand: {`,
      `  title: string`,
      `  subtitle: string`,
      `  logo: { kind: 'default' } | { kind: 'image'; src: string } | { kind: 'svg'; markup: string }`,
      `} = ${JSON.stringify(brand, null, 2)}`,
      ``,
   ].join('\n')
}
