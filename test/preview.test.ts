import { describe, expect, it } from 'vitest'
import {
   collectPreviewComponents,
   missingPreviewComponents,
   renderBlocksFile,
} from '../src/blocks-codegen'
import { validateConfig } from '../src/schema-codegen'
import type { CmsConfig } from '../src/runtime/shared/index'
import { normalizeCmsConfig } from '../src/runtime/shared/index'
import type { CmsBlockValue, CmsPreviewMedia } from '../src/runtime/shared/preview'
import {
   CMS_PREVIEW_CHANNEL,
   blockSummary,
   canHideBlock,
   collectMediaKeys,
   duplicateBlock,
   emptyBlock,
   insertBlock,
   insertionIndex,
   isTrustedPreviewEvent,
   moveBlock,
   moveTargetForInsertion,
   parseFrameMessage,
   parseHostMessage,
   previewBlocks,
   previewEnvelope,
   previewItem,
   previewMedia,
   previewPathErrors,
   removeBlock,
   selectionAfterMove,
   selectionAfterRemove,
   toggleBlockHidden,
} from '../src/runtime/shared/preview'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { I18N, contentConfig } from './fixtures'

const config = normalizeCmsConfig(contentConfig(), I18N)
const news = config.news!
const body = news.fields.body!

function media(key: string): CmsPreviewMedia {
   return previewMedia(key, undefined, '/images')
}

describe('preview message protocol', () => {
   it('wraps messages in the channel envelope', () => {
      expect(previewEnvelope({ type: 'ready' })).toEqual({
         type: 'ready',
         channel: CMS_PREVIEW_CHANNEL,
      })
   })

   it('accepts well formed frame messages', () => {
      expect(parseFrameMessage(previewEnvelope({ type: 'ready' }))).toEqual({ type: 'ready' })
      expect(parseFrameMessage(previewEnvelope({ type: 'select', index: null }))).toEqual({
         type: 'select',
         index: null,
      })
      expect(
         parseFrameMessage(previewEnvelope({ type: 'move', from: 2, to: 0, focus: true }))
      ).toEqual({ type: 'move', from: 2, to: 0, focus: true })
      for (const type of ['insert', 'duplicate', 'toggle-hidden', 'remove'] as const) {
         expect(parseFrameMessage(previewEnvelope({ type, index: 1 }))).toEqual({ type, index: 1 })
      }
   })

   it('rejects foreign, unknown and malformed frame messages', () => {
      expect(parseFrameMessage({ type: 'ready' })).toBeNull()
      expect(parseFrameMessage({ channel: 'other', type: 'ready' })).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'navigate' }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'remove', index: -1 }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'remove', index: 1.5 }))).toBeNull()
      expect(parseFrameMessage(previewEnvelope({ type: 'move', from: 0, to: '1' }))).toBeNull()
      expect(parseFrameMessage('ready')).toBeNull()
      expect(parseFrameMessage(null)).toBeNull()
   })

   it('accepts a render message and drops non-object blocks', () => {
      const state = {
         entry: 'news',
         field: 'body',
         locale: 'it',
         blocks: [{ type: 'text' }, 'junk', null],
         item: { title: { en: 'Hi' } },
         media: {},
         selected: 0,
      }
      expect(parseHostMessage(previewEnvelope({ type: 'render', state }))).toEqual({
         type: 'render',
         state: { ...state, blocks: [{ type: 'text' }] },
      })
   })

   it('rejects malformed render messages', () => {
      const valid = {
         entry: 'news',
         field: 'body',
         locale: 'en',
         blocks: [],
         item: null,
         media: {},
         selected: null,
      }
      expect(parseHostMessage(previewEnvelope({ type: 'render', state: valid }))).not.toBeNull()
      for (const broken of [
         { ...valid, entry: 1 },
         { ...valid, blocks: {} },
         { ...valid, item: [] },
         { ...valid, media: null },
         { ...valid, selected: -2 },
         { ...valid, locale: undefined },
      ]) {
         expect(parseHostMessage(previewEnvelope({ type: 'render', state: broken }))).toBeNull()
      }
      expect(parseHostMessage({ type: 'render', state: valid })).toBeNull()
      expect(parseHostMessage(previewEnvelope({ type: 'ready' }))).toBeNull()
   })

   it('trusts only the expected origin and source window', () => {
      const source = {}
      expect(
         isTrustedPreviewEvent({ origin: 'https://site.test', source }, 'https://site.test', source)
      ).toBe(true)
      expect(
         isTrustedPreviewEvent({ origin: 'https://evil.test', source }, 'https://site.test', source)
      ).toBe(false)
      expect(
         isTrustedPreviewEvent(
            { origin: 'https://site.test', source: {} },
            'https://site.test',
            source
         )
      ).toBe(false)
      expect(
         isTrustedPreviewEvent(
            { origin: 'https://site.test', source: null },
            'https://site.test',
            null
         )
      ).toBe(false)
   })
})

describe('block list operations', () => {
   const list: CmsBlockValue[] = [
      { type: 'text', heading: 'a' },
      { type: 'image', image: null },
      { type: 'text', heading: 'c' },
   ]

   it('builds an empty block with every field set to null', () => {
      expect(emptyBlock('text', body.blocks!.text!)).toEqual({
         type: 'text',
         heading: null,
         body: null,
      })
   })

   it('inserts at a clamped position without mutating the list', () => {
      const item = { type: 'image' }
      expect(insertBlock(list, 1, item)[1]).toBe(item)
      expect(insertBlock(list, 99, item).at(-1)).toBe(item)
      expect(insertBlock(list, -5, item)[0]).toBe(item)
      expect(list).toHaveLength(3)
   })

   it('moves a block and ignores out of range moves', () => {
      expect(moveBlock(list, 0, 2).map((item) => item.heading ?? item.type)).toEqual([
         'image',
         'c',
         'a',
      ])
      expect(moveBlock(list, 2, 0).map((item) => item.heading ?? item.type)).toEqual([
         'c',
         'a',
         'image',
      ])
      expect(moveBlock(list, 0, 3)).toEqual(list)
      expect(moveBlock(list, -1, 0)).toEqual(list)
   })

   it('duplicates a block as a deep copy right after it', () => {
      const nested = [{ type: 'text', heading: { en: 'x' } }]
      const next = duplicateBlock(nested, 0)
      expect(next).toHaveLength(2)
      expect(next[1]).toEqual(nested[0])
      expect(next[1]).not.toBe(nested[0])
      expect(next[1]!.heading).not.toBe(nested[0]!.heading)
      expect(duplicateBlock(nested, 5)).toEqual(nested)
   })

   it('removes a block', () => {
      expect(removeBlock(list, 1).map((item) => item.type)).toEqual(['text', 'text'])
   })

   it('toggles the implicit hidden flag unless the block declares its own', () => {
      const hidden = toggleBlockHidden(list, 0, body.blocks!.text)
      expect(hidden[0]).toEqual({ type: 'text', heading: 'a', hidden: true })
      expect(toggleBlockHidden(hidden, 0, body.blocks!.text)[0]).toEqual(list[0])
      const own = { label: 'X', fields: { hidden: { label: 'Hidden', type: 'boolean' as const } } }
      expect(canHideBlock(own)).toBe(false)
      expect(toggleBlockHidden(list, 0, own)).toEqual(list)
      expect(canHideBlock(undefined)).toBe(false)
   })

   it('keeps the selection on the same block after a move or removal', () => {
      expect(selectionAfterMove(1, 1, 3)).toBe(3)
      expect(selectionAfterMove(2, 0, 3)).toBe(1)
      expect(selectionAfterMove(2, 4, 0)).toBe(3)
      expect(selectionAfterMove(2, 3, 4)).toBe(2)
      expect(selectionAfterMove(null, 0, 1)).toBeNull()
      expect(selectionAfterRemove(2, 2)).toBeNull()
      expect(selectionAfterRemove(3, 1)).toBe(2)
      expect(selectionAfterRemove(0, 1)).toBe(0)
   })

   it('turns a drop position into a move target', () => {
      const boxes = [
         { index: 0, top: 0, bottom: 100 },
         { index: 2, top: 100, bottom: 200 },
      ]
      expect(insertionIndex(boxes, 10, 3)).toBe(0)
      expect(insertionIndex(boxes, 60, 3)).toBe(2)
      expect(insertionIndex(boxes, 190, 3)).toBe(3)
      expect(insertionIndex([], 10, 4)).toBe(4)
      expect(moveTargetForInsertion(0, 3)).toBe(2)
      expect(moveTargetForInsertion(2, 0)).toBe(0)
   })
})

describe('preview data', () => {
   const values = {
      title: { en: 'Spring', it: 'Primavera' },
      excerpt: { en: 'Short' },
      cover: 'covers/lake.jpg',
      category: 'cat_1',
      featured: true,
      body: [
         { type: 'text', heading: { en: 'Hello', it: 'Ciao' }, body: { en: '<p>x</p>' } },
         { type: 'image', image: 'blocks/river.jpg', hidden: true },
      ],
   }

   it('collects every media key of the item and its blocks', () => {
      expect(collectMediaKeys(news.fields, values).sort()).toEqual([
         'blocks/river.jpg',
         'covers/lake.jpg',
      ])
      expect(
         collectMediaKeys(
            { files: { label: 'F', type: 'media', translatable: true } },
            { files: { en: 'a.pdf', it: 'b.pdf' } }
         )
      ).toEqual(['a.pdf', 'b.pdf'])
   })

   it('builds a media object from the library or from the key', () => {
      expect(media('blocks/river.jpg')).toMatchObject({
         key: 'blocks/river.jpg',
         url: '/images/blocks/river.jpg',
         type: 'image',
         alt: null,
      })
      const item = {
         key: 'a.jpg',
         alt: 'Lake',
         folder: null,
         mime: 'image/jpeg',
         size: 10,
         width: 800,
         height: 600,
         createdAt: null,
         type: 'image' as const,
         url: 'https://cdn.test/a.jpg',
      }
      expect(previewMedia('a.jpg', item, '/images')).toMatchObject({
         url: 'https://cdn.test/a.jpg',
         alt: 'Lake',
         width: 800,
      })
   })

   it('localizes blocks like GraphQL and resolves their media', () => {
      const map = { 'blocks/river.jpg': media('blocks/river.jpg') }
      const blocks = previewBlocks(body, values.body, 'it', 'en', map)
      expect(blocks[0]).toEqual({ type: 'text', heading: 'Ciao', body: '<p>x</p>' })
      expect(blocks[1]).toMatchObject({
         type: 'image',
         hidden: true,
         image: map['blocks/river.jpg'],
      })
      expect(previewBlocks(body, null, 'en', 'en', {})).toEqual([])
   })

   it('localizes the item for the preview wrapper', () => {
      const map = { 'covers/lake.jpg': media('covers/lake.jpg') }
      const item = previewItem(news.fields, values, 'it', 'en', map)
      expect(item.title).toBe('Primavera')
      expect(item.excerpt).toBe('Short')
      expect(item.cover).toEqual(map['covers/lake.jpg'])
      expect(item.seoImage).toBeNull()
      expect(item.category).toBe('cat_1')
      expect(item.featured).toBe(true)
      expect((item.body as unknown[]).length).toBe(2)
   })

   it('summarizes a block from its first text field', () => {
      const text = body.blocks!.text!
      expect(blockSummary(text, values.body[0]!, 'it', 'en')).toBe('Ciao')
      expect(
         blockSummary(text, { type: 'text', body: { en: '<p>a   <b>b</b></p>' } }, 'it', 'en')
      ).toBe('a b')
      expect(blockSummary(text, { type: 'text', heading: 'x'.repeat(100) }, 'en', 'en', 10)).toBe(
         `${'x'.repeat(9)}…`
      )
      expect(blockSummary(body.blocks!.image, { type: 'image' }, 'en', 'en')).toBe('')
   })
})

describe('preview configuration', () => {
   it('validates the preview path', () => {
      expect(previewPathErrors('/cms/preview', ['news'])).toEqual([])
      expect(previewPathErrors('/cms/live-view', [])).toEqual([])
      expect(previewPathErrors('/preview', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/a/b', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/Preview', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/login', [])).toHaveLength(1)
      expect(previewPathErrors('/cms/news', ['news'])).toHaveLength(1)
   })

   it('accepts a preview component on content entries only', () => {
      const valid = contentConfig()
      valid.news!.preview = { component: 'NewsArticle' }
      expect(validateConfig(valid, I18N)).toEqual([])

      const empty = contentConfig()
      empty.news!.preview = { component: ' ' }
      expect(validateConfig(empty, I18N).join('\n')).toContain(
         'preview.component must be a non-empty string'
      )

      const wrong = contentConfig()
      wrong.events!.preview = { component: 'EventArticle' }
      expect(validateConfig(wrong, I18N).join('\n')).toContain("preview needs kind 'content'")
   })

   it('generates the preview component map with a module level fallback', () => {
      const withEntry = normalizeCmsConfig(contentConfig(), I18N) as CmsConfig
      expect(collectPreviewComponents(withEntry)).toEqual([])
      expect(collectPreviewComponents(withEntry, 'site-article')).toEqual([
         { entry: 'news', component: 'SiteArticle' },
      ])
      withEntry.news!.preview = { component: 'NewsArticle' }
      const refs = collectPreviewComponents(withEntry, 'SiteArticle')
      expect(refs).toEqual([{ entry: 'news', component: 'NewsArticle' }])
      const file = renderBlocksFile([], refs)
      expect(file).toContain("import { LazyNewsArticle } from '#components'")
      expect(file).toContain('"news": LazyNewsArticle,')
      expect(missingPreviewComponents(refs, ['NewsArticle'])).toEqual([])
      expect(missingPreviewComponents(refs, [])).toEqual([
         "cms.config entry 'news': preview component 'NewsArticle' is not a registered Nuxt component",
      ])
   })
})

describe('required translatable values', () => {
   it('reports a missing translatable value as a required field', () => {
      const schema = buildEntrySchema({ fields: news.fields, drafts: true }, I18N)
      const result = schema.safeParse({
         title: null,
         slug: 'a',
         body: [{ type: 'text', body: null }],
      })
      const messages = result.error!.issues.map((issue) => [issue.path.join('.'), issue.message])
      expect(messages).toContainEqual(['title', 'Required field'])
      expect(messages).toContainEqual(['body.0.body', 'Required field'])
   })
})
