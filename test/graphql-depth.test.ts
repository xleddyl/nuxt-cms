import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { createDepthRule } from '../src/runtime/server/utils/graphql-depth'

const schema = buildSchema(`
   type Node {
      id: ID
      child: Node
   }
   type Query {
      node: Node
   }
`)

function depthErrors(query: string, maxDepth = 8) {
   return validate(schema, parse(query), [createDepthRule(maxDepth)]).map((error) => error.message)
}

function fragmentChain(length: number) {
   const fragments = Array.from({ length }, (_, index) =>
      index === length - 1
         ? `fragment F${index} on Node { id }`
         : `fragment F${index} on Node { ...F${index + 1} child { ...F${index + 1} } }`
   )
   return `{ node { ...F0 } } ${fragments.join(' ')}`
}

describe('createDepthRule', () => {
   it('accepts a query within the limit', () => {
      expect(depthErrors('{ node { child { id } } }', 3)).toEqual([])
   })

   it('rejects a query above the limit', () => {
      expect(depthErrors('{ node { child { child { id } } } }', 3)).toEqual([
         'Query is too deep: depth 4 exceeds the maximum of 3',
      ])
   })

   it('counts depth through fragment spreads', () => {
      expect(depthErrors(fragmentChain(4), 5)).toEqual([])
      expect(depthErrors(fragmentChain(4), 4)).toHaveLength(1)
   })

   it('measures each fragment once when fragments fan out', () => {
      const started = performance.now()
      const errors = depthErrors(fragmentChain(40), 100)
      expect(errors).toEqual([])
      expect(performance.now() - started).toBeLessThan(500)
   })
})
