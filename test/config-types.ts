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
         tags: { label: 'Tags', type: 'select', options: ['a', 'b'], multiple: true },
         parent: { label: 'Parent', type: 'relation', to: 'categories' },
         cover: { label: 'Cover', type: 'media', mediaType: 'image', translatable: true },
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
         // @ts-expect-error
         badSelect: { label: 'Bad', type: 'select' },
         // @ts-expect-error
         badRelation: { label: 'Bad', type: 'relation' },
         // @ts-expect-error
         badSlug: { label: 'Bad', type: 'slug' },
         // @ts-expect-error
         badBlocks: { label: 'Bad', type: 'blocks' },
         // @ts-expect-error
         badText: { label: 'Bad', type: 'text', options: ['a'] },
         // @ts-expect-error
         badNumber: { label: 'Bad', type: 'number', translatable: true },
         // @ts-expect-error
         badType: { label: 'Bad', type: 'nope' },
      },
   },
})
