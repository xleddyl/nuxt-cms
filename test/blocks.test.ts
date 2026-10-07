import { describe, expect, it, vi } from 'vitest'
import {
   collectBlockComponents,
   componentPascalName,
   missingBlockComponents,
   renderBlocksFile,
} from '../src/blocks-codegen'
import type { CmsBlockItem } from '../src/runtime/app/blocks/resolve'
import {
   cmsBlockComponent,
   cmsBlockProps,
   resolveCmsBlocks,
} from '../src/runtime/app/blocks/resolve'
import { cmsBlockComponents } from './stubs/cms-blocks'
import { normalizeCmsConfig, publicBlocks, resolveBlocksMedia } from '../src/runtime/shared/index'
import { I18N, contentConfig } from './fixtures'

const config = normalizeCmsConfig(contentConfig(), I18N)

describe('block components codegen', () => {
   const refs = collectBlockComponents(config)

   it('collects every block that names a component, keyed by GraphQL type name', () => {
      expect(refs).toEqual([
         {
            entry: 'news',
            field: 'body',
            block: 'text',
            component: 'SectionText',
            typeName: 'NewsBodyText',
         },
         {
            entry: 'news',
            field: 'body',
            block: 'image',
            component: 'SectionImage',
            typeName: 'NewsBodyImage',
         },
      ])
   })

   it('renders a map that imports lazy components from #components', () => {
      const file = renderBlocksFile(refs)
      expect(file).toContain("import { LazySectionImage, LazySectionText } from '#components'")
      expect(file).toContain('"NewsBodyText": LazySectionText,')
      expect(file).toContain('"NewsBodyImage": LazySectionImage,')
   })

   it('renders an empty map without importing #components', () => {
      const file = renderBlocksFile([])
      expect(file).not.toContain('#components')
      expect(file).toContain('export const cmsBlockComponents: Record<string, Component> = {\n}')
   })

   it('keeps the same block name apart across fields', () => {
      const shared = normalizeCmsConfig(contentConfig(), I18N)
      shared.events!.fields.body!.blocks!.hero!.component = 'SectionText'
      const typeNames = collectBlockComponents(shared).map((ref) => ref.typeName)
      expect(typeNames).toContain('EventsBodyHero')
      expect(new Set(typeNames).size).toBe(typeNames.length)
   })

   it('reports a component missing from the Nuxt registry', () => {
      expect(missingBlockComponents(refs, ['SectionText'])).toEqual([
         "cms.config entry 'news', field 'body', block 'image': component 'SectionImage' is not a registered Nuxt component",
      ])
      expect(missingBlockComponents(refs, ['SectionText', 'SectionImage'])).toEqual([])
   })

   it('turns a kebab-case name into the Nuxt pascal name', () => {
      expect(componentPascalName('section-image')).toBe('SectionImage')
      expect(componentPascalName('SectionImage')).toBe('SectionImage')
   })
})

describe('block rendering', () => {
   const blocks: CmsBlockItem[] = [
      { __typename: 'NewsBodyText', type: 'text', heading: 'Hi', body: '<p>x</p>' } as CmsBlockItem,
      { __typename: 'NewsBodyImage', type: 'image', image: null, hidden: true } as CmsBlockItem,
      { __typename: 'NewsBodyQuote', type: 'quote', text: 'Q' } as CmsBlockItem,
      { type: 'image', image: null } as CmsBlockItem,
   ]

   it('resolves by __typename, skips hidden and unknown blocks', () => {
      const onMissing = vi.fn()
      const resolved = resolveCmsBlocks(blocks, { onMissing })
      expect(resolved.map((block) => [block.index, block.type])).toEqual([[0, 'text']])
      expect(resolved[0]!.component).toBe(cmsBlockComponents.NewsBodyText)
      expect(resolved[0]!.props).toEqual({ heading: 'Hi', body: '<p>x</p>' })
      expect(onMissing).toHaveBeenCalledTimes(2)
   })

   it('resolves by entry and field when the data has no __typename', () => {
      const resolved = resolveCmsBlocks(blocks, { entry: 'news' })
      expect(resolved.map((block) => block.key)).toEqual(['0:text', '3:image'])
      expect(cmsBlockComponent({ type: 'text' }, 'news', 'body')).toBe(
         cmsBlockComponents.NewsBodyText
      )
      expect(cmsBlockComponent({ type: 'text' }, 'news', 'other')).toBeUndefined()
   })

   it('still renders a block whose subfields come back null', () => {
      const resolved = resolveCmsBlocks([
         { __typename: 'NewsBodyText', type: 'text', heading: null, body: null } as CmsBlockItem,
      ])
      expect(resolved[0]!.component).toBe(cmsBlockComponents.NewsBodyText)
      expect(resolved[0]!.props).toEqual({ heading: null, body: null })
   })

   it('passes every field but type and __typename as props', () => {
      expect(cmsBlockProps({ __typename: 'X', type: 'a', title: 't' } as CmsBlockItem)).toEqual({
         title: 't',
      })
   })
})

describe('public block values', () => {
   const body = config.news!.fields.body!

   it('drops hidden blocks unless the block declares a hidden field', () => {
      const value = [
         { type: 'text', hidden: true },
         { type: 'image', image: 'a.jpg' },
      ]
      expect(publicBlocks(body, value)).toEqual([{ type: 'image', image: 'a.jpg' }])
      const declared = config.events!.fields.body!
      declared.blocks!.hero!.fields.hidden = { label: 'Hidden', type: 'boolean' }
      expect(publicBlocks(declared, [{ type: 'hero', hidden: true }])).toEqual([
         { type: 'hero', hidden: true },
      ])
   })

   it('resolves media keys of a block through a callback', () => {
      const resolved = resolveBlocksMedia(body, [{ type: 'image', image: 'a.jpg' }], (key) => ({
         key,
         url: `/m/${key}`,
      }))
      expect(resolved).toEqual([{ type: 'image', image: { key: 'a.jpg', url: '/m/a.jpg' } }])
   })
})
