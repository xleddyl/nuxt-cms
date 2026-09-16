import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { collectionQuery, renderQueriesFile, singleQuery } from '../src/queries-codegen'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import { sampleConfig } from './fixtures'

const MEDIA = 'key url type alt folder mime size width height'

describe('generated entry queries', () => {
   const config = sampleConfig()
   const schema = buildSchema(renderGraphqlSdl(config))
   const events = collectionQuery(config, 'events', config.events!)
   const homepage = singleQuery(config, 'homepage', config.homepage!)

   it('produces a query that the schema accepts for every entry', () => {
      for (const [name, entry] of Object.entries(config)) {
         const query =
            entry.kind === 'single'
               ? singleQuery(config, name, entry)
               : collectionQuery(config, name, entry)
         expect(validate(schema, parse(query))).toEqual([])
      }
   })

   it('gives a single the locale argument only', () => {
      expect(homepage).toContain('query CmsSingle($locale: String)')
      expect(homepage).toContain('homepage(locale: $locale)')
   })

   it('gives a collection the filter, sort and page arguments', () => {
      expect(events).toContain('$filters: EventsFilters')
      expect(events).toContain('$sort: [EventsSort!]')
      expect(events).toContain('$limit: Int, $offset: Int')
   })

   it('selects every field of a media object', () => {
      expect(events).toContain(`poster { ${MEDIA} }`)
   })

   it('selects each block type with an inline fragment', () => {
      expect(events).toContain('body { type ... on EventsBodyHero { heading }')
      expect(events).toContain('... on EventsBodyQuote { text author }')
   })

   it('selects a relation one level deep', () => {
      expect(events).toContain('category { id name createdAt updatedAt }')
      expect(events).toContain('tags { id name createdAt updatedAt }')
   })

   it('leaves private fields out', () => {
      const withPrivate = sampleConfig()
      withPrivate.events!.fields.poster!.private = true
      expect(collectionQuery(withPrivate, 'events', withPrivate.events!)).not.toContain('poster')
   })

   it('splits singles and collections into two maps', () => {
      const file = renderQueriesFile(config)
      expect(file).toContain('export const cmsSingleQueries')
      expect(file).toContain('export const cmsCollectionQueries')
      expect(file.split('cmsCollectionQueries')[0]).toContain('"homepage"')
      expect(file.split('cmsCollectionQueries')[1]).toContain('"events"')
   })
})
