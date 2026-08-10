import { buildSchema } from 'graphql'
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
