import { describe, expect, it } from 'vitest'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig } from '../src/runtime/shared/index'
import { expandMobileMedia } from '../src/runtime/shared/index'
import { validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'

const I18N = { locales: ['en', 'it'], defaultLocale: 'en' }

function config(): CmsConfig {
   return {
      home: {
         id: 'home',
         label: 'Home',
         kind: 'single',
         tabs: [{ id: 'images', label: 'Images' }],
         fields: {
            hero: {
               label: 'Hero',
               type: 'media',
               mediaType: ['image', 'video'],
               mobile: true,
               required: true,
               tab: 'images',
            },
            title: { label: 'Title', type: 'text' },
         },
      },
      pages: {
         id: 'pages',
         label: 'Pages',
         kind: 'page',
         pages: [
            { path: '/', key: 'home', label: 'Home' },
            { path: '/about', key: 'about', label: 'About' },
         ],
         columns: ['cover'],
         fields: {
            cover: { label: 'Cover', type: 'media', mobile: true },
            banner: { label: 'Banner', type: 'media', mobile: true },
         },
         overrides: {
            '/': {
               banner: null,
               intro: { label: 'Intro', type: 'media', mediaType: 'video', mobile: true },
            },
         },
      },
   }
}

describe('expandMobileMedia', () => {
   it('adds an optional mobile field right after the media field', () => {
      const fields = expandMobileMedia(config()).home!.fields
      expect(Object.keys(fields)).toEqual(['hero', 'heroMobile', 'title'])
      expect(fields.heroMobile).toEqual({
         label: 'Hero (mobile)',
         type: 'media',
         mediaType: ['image', 'video'],
         tab: 'images',
         mobileOf: 'hero',
      })
   })

   it('expands page overrides and columns', () => {
      const pages = expandMobileMedia(config()).pages!
      expect(pages.columns).toEqual(['cover', 'coverMobile'])
      expect(Object.keys(pages.fields)).toEqual(['cover', 'coverMobile', 'banner', 'bannerMobile'])
      expect(pages.overrides!['/']).toEqual({
         banner: null,
         bannerMobile: null,
         intro: { label: 'Intro', type: 'media', mediaType: 'video', mobile: true },
         introMobile: {
            label: 'Intro (mobile)',
            type: 'media',
            mediaType: 'video',
            mobileOf: 'intro',
         },
      })
   })

   it('gives the same result when it runs twice', () => {
      expect(expandMobileMedia(expandMobileMedia(config()))).toEqual(expandMobileMedia(config()))
   })

   it('produces a valid config with the mobile field in the types and the schema', () => {
      const expanded = expandMobileMedia(config())
      expect(validateConfig(expanded, I18N)).toEqual([])
      expect(renderGraphqlSdl(expanded)).toContain('heroMobile: CmsMedia')
      expect(renderTypesFile(expanded)).toContain('heroMobile')
   })
})

describe('mobile media validation', () => {
   it('rejects mobile on a field that is not media', () => {
      const cfg = config()
      cfg.home!.fields.title = { label: 'Title', type: 'text', mobile: true }
      expect(validateConfig(expandMobileMedia(cfg), I18N)).toContain(
         "cms.config entry 'home', field 'title': mobile is only supported on media fields"
      )
   })

   it('rejects a declared field that takes the mobile key', () => {
      const cfg = config()
      cfg.home!.fields.heroMobile = { label: 'Other', type: 'text' }
      expect(validateConfig(expandMobileMedia(cfg), I18N)).toContain(
         "cms.config entry 'home', field 'hero': mobile needs the key 'heroMobile', which is already declared"
      )
   })

   it('rejects mobile inside blocks', () => {
      const cfg = config()
      cfg.home!.fields.gallery = {
         label: 'Gallery',
         type: 'blocks',
         blocks: {
            image: {
               label: 'Image',
               fields: { photo: { label: 'Photo', type: 'media', mobile: true } },
            },
         },
      }
      expect(validateConfig(expandMobileMedia(cfg), I18N)).toContain(
         "cms.config entry 'home', field 'gallery', block 'image', field 'photo': mobile is not supported inside blocks"
      )
   })
})
