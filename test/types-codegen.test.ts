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
