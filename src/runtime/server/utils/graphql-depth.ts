import type {
   ASTVisitor,
   FragmentDefinitionNode,
   SelectionSetNode,
   ValidationContext,
} from 'graphql'
import { GraphQLError, Kind } from 'graphql'

const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_FIELDS = 500

function measure(
   selectionSet: SelectionSetNode,
   fragments: Map<string, FragmentDefinitionNode>,
   visited: Set<string>
): number {
   let max = 0
   for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
         if (selection.name.value.startsWith('__')) continue
         const depth = selection.selectionSet
            ? 1 + measure(selection.selectionSet, fragments, visited)
            : 1
         max = Math.max(max, depth)
      } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
         const name = selection.name.value
         if (visited.has(name)) continue
         const fragment = fragments.get(name)
         if (fragment) {
            visited.add(name)
            max = Math.max(max, measure(fragment.selectionSet, fragments, visited))
            visited.delete(name)
         }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
         max = Math.max(max, measure(selection.selectionSet, fragments, visited))
      }
   }
   return max
}

export function createDepthRule(maxDepth?: number) {
   const limit =
      typeof maxDepth === 'number' && Number.isFinite(maxDepth) && maxDepth > 0
         ? maxDepth
         : DEFAULT_MAX_DEPTH
   return (context: ValidationContext): ASTVisitor => ({
      OperationDefinition(node) {
         const fragments = new Map<string, FragmentDefinitionNode>()
         for (const definition of context.getDocument().definitions) {
            if (definition.kind === Kind.FRAGMENT_DEFINITION)
               fragments.set(definition.name.value, definition)
         }
         const depth = measure(node.selectionSet, fragments, new Set())
         if (depth > limit) {
            context.reportError(
               new GraphQLError(`Query is too deep: depth ${depth} exceeds the maximum of ${limit}`)
            )
         }
      },
   })
}

export function createBreadthRule(maxFields?: number) {
   const limit =
      typeof maxFields === 'number' && Number.isFinite(maxFields) && maxFields > 0
         ? maxFields
         : DEFAULT_MAX_FIELDS
   return (context: ValidationContext): ASTVisitor => {
      let count = 0
      let reported = false
      return {
         Field() {
            count++
            if (count > limit && !reported) {
               reported = true
               context.reportError(
                  new GraphQLError(
                     `Query has too many field selections: exceeds the maximum of ${limit}`
                  )
               )
            }
         },
      }
   }
}

export function createIntrospectionRule() {
   return (context: ValidationContext): ASTVisitor => ({
      Field(node) {
         if (node.name.value === '__schema' || node.name.value === '__type') {
            context.reportError(new GraphQLError('Introspection is disabled'))
         }
      },
   })
}
