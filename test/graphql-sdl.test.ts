import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import { sampleConfig } from './fixtures'

describe('renderGraphqlSdl', () => {
   const sdl = renderGraphqlSdl(sampleConfig())

   it('produces a valid GraphQL schema', () => {
      expect(() => buildSchema(sdl)).not.toThrow()
   })

   it('exposes list, byId and count queries for collections', () => {
      expect(sdl).toContain('events(')
      expect(sdl).toContain('eventsById(')
      expect(sdl).toContain('eventsCount(')
   })

   it('exposes singles without list arguments', () => {
      expect(sdl).toContain('homepage(')
      expect(sdl).not.toContain('homepageCount')
   })

   it('renders relations and media as object types', () => {
      expect(sdl).toContain('category: Categories')
      expect(sdl).toContain('tags: [Categories!]!')
      expect(sdl).toContain('poster: CmsMedia')
   })

   it('renders multi-select fields as non-null string lists', () => {
      expect(sdl).toContain('species: [String!]!')
   })

   it('renders translatable media with the same CmsMedia shape', () => {
      expect(sdl).toContain('brochure: CmsMedia')
   })

   it('keeps translatable media out of the filter input and sort enum', () => {
      const filters = sdl.match(/input EventsFilters \{[^}]*\}/)![0]
      const sortFields = sdl.match(/enum EventsSortField \{[^}]*\}/)![0]
      expect(filters).toContain('poster: StringFilter')
      expect(filters).not.toContain('brochure')
      expect(sortFields).toContain('poster')
      expect(sortFields).not.toContain('brochure')
   })

   it('still builds a valid schema when every media field of a collection is translatable', () => {
      const config = sampleConfig()
      config.events!.fields.poster!.translatable = true
      const out = renderGraphqlSdl(config)
      expect(() => buildSchema(out)).not.toThrow()
      expect(out.match(/enum EventsSortField \{[^}]*\}/)![0]).not.toContain('poster')
   })

   it('renders blocks fields as an interface implemented by every block', () => {
      expect(sdl).toContain('interface EventsBodyBlock {')
      expect(sdl).toContain('type EventsBodyHero implements EventsBodyBlock {')
      expect(sdl).toContain('type EventsBodyQuote implements EventsBodyBlock {')
      expect(sdl).not.toContain('union EventsBodyBlock')
   })

   it('keeps on the interface only the fields that every block declares', () => {
      const iface = sdl.match(/interface EventsBodyBlock \{[^}]*\}/)![0]
      expect(iface).toContain('type: String!')
      expect(iface).not.toContain('heading')
      expect(iface).not.toContain('text')
   })

   it('makes a shared field nullable when one block leaves it optional', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks!.quote!.fields.heading = {
         label: 'Heading',
         type: 'text',
      }
      const out = renderGraphqlSdl(config)
      expect(() => buildSchema(out)).not.toThrow()
      expect(out.match(/interface EventsBodyBlock \{[^}]*\}/)![0]).toContain('heading: String')
      expect(out.match(/interface EventsBodyBlock \{[^}]*\}/)![0]).not.toContain('heading: String!')
   })

   it('lets a single-block field select its fields without an inline fragment', () => {
      const config = sampleConfig()
      config.events!.fields.body!.blocks = {
         image: {
            label: 'Image',
            fields: {
               photo: { label: 'Photo', type: 'media', mediaType: 'image', required: true },
               hidden: { label: 'Hidden', type: 'boolean' },
            },
         },
      }
      const schema = buildSchema(renderGraphqlSdl(config))
      const query = parse('{ events { body { hidden photo { url type } } } }')
      expect(validate(schema, query)).toEqual([])
   })

   it('renders the media type as an enum', () => {
      expect(sdl).toContain('enum CmsMediaType {')
      expect(sdl).toContain('type: CmsMediaType!')
   })

   it('omits private fields from the type, filters and sort enum', () => {
      const config = sampleConfig()
      config.events!.fields.poster!.private = true
      const out = renderGraphqlSdl(config)
      expect(() => buildSchema(out)).not.toThrow()
      expect(out.match(/type Events \{[^}]*\}/)![0]).not.toContain('poster')
      expect(out.match(/input EventsFilters \{[^}]*\}/)![0]).not.toContain('poster')
      expect(out.match(/enum EventsSortField \{[^}]*\}/)![0]).not.toContain('poster')
   })

   it('omits the block types of a private blocks field', () => {
      const config = sampleConfig()
      config.events!.fields.body!.private = true
      const out = renderGraphqlSdl(config)
      expect(() => buildSchema(out)).not.toThrow()
      expect(out).not.toContain('EventsBodyBlock')
      expect(out).not.toContain('EventsBodyHero')
   })

   it('builds a valid schema when every field of a collection is private', () => {
      const config = sampleConfig()
      for (const field of Object.values(config.categories!.fields)) field.private = true
      const out = renderGraphqlSdl(config)
      expect(() => buildSchema(out)).not.toThrow()
      expect(out.match(/type Categories \{[^}]*\}/)![0]).not.toContain('name')
   })
})
