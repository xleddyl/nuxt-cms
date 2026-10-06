import type { CmsConfig } from './runtime/shared/index'
import { blockTypeName, entryFieldsFor, isPrivateField } from './runtime/shared/index'

export interface BlockComponentRef {
   entry: string
   field: string
   block: string
   component: string
   typeName: string
}

export function componentPascalName(name: string): string {
   return name
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
}

export function collectBlockComponents(config: CmsConfig): BlockComponentRef[] {
   const refs: BlockComponentRef[] = []
   for (const [entryName, entry] of Object.entries(config)) {
      for (const [fieldKey, field] of Object.entries(entryFieldsFor(entry))) {
         if (field.type !== 'blocks' || isPrivateField(field)) continue
         for (const [blockName, block] of Object.entries(field.blocks ?? {})) {
            if (typeof block.component !== 'string' || !block.component.trim()) continue
            refs.push({
               entry: entryName,
               field: fieldKey,
               block: blockName,
               component: componentPascalName(block.component.trim()),
               typeName: blockTypeName(entryName, fieldKey, blockName),
            })
         }
      }
   }
   return refs
}

export interface PreviewComponentRef {
   entry: string
   component: string
}

export function collectPreviewComponents(
   config: CmsConfig,
   fallback?: string
): PreviewComponentRef[] {
   const refs: PreviewComponentRef[] = []
   for (const [entryName, entry] of Object.entries(config)) {
      if (entry.kind !== 'content') continue
      const name = entry.preview?.component ?? fallback
      if (typeof name !== 'string' || !name.trim()) continue
      refs.push({ entry: entryName, component: componentPascalName(name.trim()) })
   }
   return refs
}

export function missingPreviewComponents(
   refs: PreviewComponentRef[],
   available: Iterable<string>
): string[] {
   const known = new Set(available)
   return refs
      .filter((ref) => !known.has(ref.component))
      .map(
         (ref) =>
            `cms.config entry '${ref.entry}': preview component '${ref.component}' is not a registered Nuxt component`
      )
}

export function missingBlockComponents(
   refs: BlockComponentRef[],
   available: Iterable<string>
): string[] {
   const known = new Set(available)
   return refs
      .filter((ref) => !known.has(ref.component))
      .map(
         (ref) =>
            `cms.config entry '${ref.entry}', field '${ref.field}', block '${ref.block}': component '${ref.component}' is not a registered Nuxt component`
      )
}

export function renderBlocksFile(
   refs: BlockComponentRef[],
   previews: PreviewComponentRef[] = []
): string {
   const components = [...new Set([...refs, ...previews].map((ref) => ref.component))].sort()
   const lines = [`import type { Component } from 'vue'`]
   if (components.length)
      lines.push(
         `import { ${components.map((name) => `Lazy${name}`).join(', ')} } from '#components'`
      )
   lines.push(
      ``,
      `export const cmsBlockComponents: Record<string, Component> = {`,
      ...refs.map((ref) => `   ${JSON.stringify(ref.typeName)}: Lazy${ref.component},`),
      `}`,
      ``,
      `export const cmsPreviewComponents: Record<string, Component> = {`,
      ...previews.map((ref) => `   ${JSON.stringify(ref.entry)}: Lazy${ref.component},`),
      `}`,
      ``
   )
   return lines.join('\n')
}
