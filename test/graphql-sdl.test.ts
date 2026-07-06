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
})
