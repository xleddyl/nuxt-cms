import { describe, expect, it } from 'vitest'
import { renderTypesFile } from '../src/types-codegen'
import { sampleConfig } from './fixtures'

describe('renderTypesFile', () => {
   const out = renderTypesFile(sampleConfig())

   it('declares CmsMedia with a media type parameter', () => {
      expect(out).toContain("export type CmsMediaType = 'image' | 'video' | 'file'")
      expect(out).toContain('export interface CmsMedia<T extends CmsMediaType = CmsMediaType>')
   })

   it('narrows a media field to the declared media type', () => {
      expect(out).toContain("poster: CmsMedia<'image'> | null")
   })

   it('keeps the full media type when the field accepts any file', () => {
      expect(out).toContain('brochure: CmsMedia | null')
   })

   it('maps every entry name to its auto-selected type', () => {
      expect(out).toContain('export interface CmsSingleTypes {\n  "homepage": HomepageAuto\n}')
      expect(out).toContain('"events": EventsAuto')
      expect(out).toContain('export type CmsSingleName = keyof CmsSingleTypes')
      expect(out).toContain('export type CmsCollectionName = keyof CmsCollectionTypes')
   })

   it('keeps the auto type identical when the entry has no relation', () => {
      expect(out).toContain('export type HomepageAuto = Homepage')
   })

   it('replaces relations with a shallow type in the auto type', () => {
      expect(out).toContain("export type EventsAuto = Omit<Events, 'category' | 'tags'> & {")
      expect(out).toContain('  category: Categories | null')
      expect(out).toContain('  tags: Categories[]')
   })

   it('renders every block subfield as nullable, required or not', () => {
      expect(out).toContain('export interface EventsBodyHeroProps {\n  heading: string | null\n}')
      expect(out).toContain(
         'export interface EventsBodyQuoteProps {\n  text: string | null\n  author: string | null\n}'
      )
      expect(out).toContain("  __typename?: 'EventsBodyHero'\n  type: 'hero'")
   })

   it('keeps top-level required fields non-null', () => {
      expect(out).toMatch(/export interface Events \{[^}]*\n  title: string\n/)
   })

   it('renders a required media field inside a block as nullable', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.image = {
         label: 'Image',
         type: 'media',
         mediaType: 'image',
         required: true,
      }
      expect(renderTypesFile(config)).toContain("image: CmsMedia<'image'> | null")
   })

   it('narrows a media field inside a block', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.hero!.fields.image = {
         label: 'Image',
         type: 'media',
         mediaType: ['image', 'video'],
      }
      expect(renderTypesFile(config)).toContain("image: CmsMedia<'image' | 'video'> | null")
   })
})
