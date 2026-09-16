import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { CmsEntry, CmsPageRoute } from './index'
import { pageKeyFromPath, pageLabelFromPath } from './index'

const DYNAMIC = /[[\]]/

function vueFiles(dir: string, prefix = ''): string[] {
   if (!existsSync(dir)) return []
   const files: string[] = []
   for (const item of readdirSync(dir, { withFileTypes: true })) {
      const name = `${prefix}${item.name}`
      if (item.isDirectory()) files.push(...vueFiles(join(dir, item.name), `${name}/`))
      else if (item.name.endsWith('.vue')) files.push(name)
   }
   return files
}

export function routePathFromFile(file: string): string | null {
   if (DYNAMIC.test(file)) return null
   const segments = file
      .replace(/\.vue$/, '')
      .split('/')
      .filter((segment) => !/^\(.+\)$/.test(segment))
   if (segments.at(-1) === 'index') segments.pop()
   const path = `/${segments.join('/')}`.replace(/\/$/, '')
   return path || '/'
}

export function routePathsFromDir(pagesDir: string): string[] {
   const paths = new Set<string>()
   for (const file of vueFiles(pagesDir)) {
      const path = routePathFromFile(file)
      if (path) paths.add(path)
   }
   return [...paths]
}

export function resolvePageRoutes(entry: CmsEntry, discovered: string[]): CmsPageRoute[] {
   const declared = Array.isArray(entry.routes) ? entry.routes : discovered
   const paths = new Set([...declared, ...(entry.include ?? [])])
   for (const path of entry.exclude ?? []) paths.delete(path)

   const rank = new Map((entry.order ?? []).map((path, index) => [path, index]))
   const order = entry.order?.length ?? 0

   return [...paths]
      .sort((a, b) => (rank.get(a) ?? order) - (rank.get(b) ?? order) || a.localeCompare(b))
      .map((path) => ({
         path,
         key: pageKeyFromPath(path),
         label: entry.labels?.[path] ?? pageLabelFromPath(path),
      }))
}
