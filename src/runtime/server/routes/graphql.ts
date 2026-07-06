import { createYoga } from 'graphql-yoga'
import { defineEventHandler } from 'h3'
import { useRuntimeConfig } from '#imports'
import { buildCmsSchema, createGraphqlContext } from '../utils/graphql'
import { createBreadthRule, createDepthRule, createIntrospectionRule } from '../utils/graphql-depth'

function buildYoga(options: { graphiql: boolean; maxDepth: number }) {
   return createYoga({
      schema: buildCmsSchema(),
      graphqlEndpoint: '/api/cms/graphql',
      landingPage: false,
      graphiql: options.graphiql,
      cors: false,
      context: () => createGraphqlContext(),
      plugins: [
         {
            onValidate({
               addValidationRule,
            }: {
               addValidationRule: (rule: ReturnType<typeof createDepthRule>) => void
            }) {
               addValidationRule(createDepthRule(options.maxDepth))
               addValidationRule(createBreadthRule())
               if (!options.graphiql) addValidationRule(createIntrospectionRule())
            },
         },
      ],
   })
}

let yoga: ReturnType<typeof buildYoga> | null = null

export default defineEventHandler((event) => {
   if (!yoga) {
      const { graphql } = useRuntimeConfig(event).cms as {
         graphql: { graphiql: boolean; maxDepth: number }
      }
      yoga = buildYoga(graphql)
   }
   return yoga(event.node.req, event.node.res)
})
