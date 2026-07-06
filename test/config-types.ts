import { defineCmsConfig } from '../src/runtime/shared/index'

export const valid = defineCmsConfig({
   categories: {
      id: 'categories',
      label: 'Categories',
      kind: 'collection',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
         slug: { label: 'Slug', type: 'slug', from: 'name' },
         kind: { label: 'Kind', type: 'select', options: ['a', 'b'] },
         parent: { label: 'Parent', type: 'relation', to: 'categories' },
         body: {
            label: 'Body',
            type: 'blocks',
            blocks: {
               hero: { label: 'Hero', fields: { heading: { label: 'Heading', type: 'text' } } },
            },
         },
      },
   },
})

export const invalid = defineCmsConfig({
   broken: {
      id: 'broken',
      label: 'Broken',
      kind: 'collection',
      fields: {
         // @ts-expect-error select requires options
         badSelect: { label: 'Bad', type: 'select' },
         // @ts-expect-error relation requires to
         badRelation: { label: 'Bad', type: 'relation' },
         // @ts-expect-error slug requires from
         badSlug: { label: 'Bad', type: 'slug' },
         // @ts-expect-error blocks requires a blocks map
         badBlocks: { label: 'Bad', type: 'blocks' },
         // @ts-expect-error text fields do not accept options
         badText: { label: 'Bad', type: 'text', options: ['a'] },
         // @ts-expect-error number fields do not accept translatable
         badNumber: { label: 'Bad', type: 'number', translatable: true },
         // @ts-expect-error unknown field type
         badType: { label: 'Bad', type: 'nope' },
      },
   },
})
