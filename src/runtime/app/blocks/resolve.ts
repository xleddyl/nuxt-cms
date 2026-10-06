import type { Component } from 'vue'
import { cmsBlockComponents } from '#cms-blocks'
import { CONTENT_BODY_FIELD, blockTypeName, isHiddenBlock } from '../../shared/index'

export interface CmsBlockItem {
   type: string
   __typename?: string
}

export interface ResolvedCmsBlock {
   key: string
   index: number
   type: string
   component: Component
   props: Record<string, unknown>
}

const OMITTED_KEYS = new Set(['type', '__typename'])

export const isHiddenCmsBlock: (item: CmsBlockItem) => boolean = isHiddenBlock

export function cmsBlockTypeName(
   item: CmsBlockItem,
   entry?: string,
   field: string = CONTENT_BODY_FIELD
): string | undefined {
   return entry ? blockTypeName(entry, field, item.type) : item.__typename
}

export function cmsBlockComponent(
   item: CmsBlockItem,
   entry?: string,
   field?: string
): Component | undefined {
   const name = cmsBlockTypeName(item, entry, field)
   return name && Object.hasOwn(cmsBlockComponents, name) ? cmsBlockComponents[name] : undefined
}

export function cmsBlockProps(item: CmsBlockItem): Record<string, unknown> {
   return Object.fromEntries(
      Object.entries(item as unknown as Record<string, unknown>).filter(
         ([key]) => !OMITTED_KEYS.has(key)
      )
   )
}

export function resolveCmsBlocks(
   blocks: readonly CmsBlockItem[] | null | undefined,
   options: { entry?: string; field?: string; onMissing?: (item: CmsBlockItem) => void } = {}
): ResolvedCmsBlock[] {
   const resolved: ResolvedCmsBlock[] = []
   ;(blocks ?? []).forEach((item, index) => {
      if (!item || typeof item !== 'object' || isHiddenCmsBlock(item)) return
      const component = cmsBlockComponent(item, options.entry, options.field)
      if (!component) {
         options.onMissing?.(item)
         return
      }
      resolved.push({
         key: `${index}:${item.type}`,
         index,
         type: item.type,
         component,
         props: cmsBlockProps(item),
      })
   })
   return resolved
}
