import type { CmsConfig, CmsI18n } from '../src/runtime/shared/index'

export const I18N: CmsI18n = { locales: ['en', 'it'], defaultLocale: 'en' }

export function sampleConfig(): CmsConfig {
   return {
      categories: {
         id: 'categories',
         label: 'Categories',
         kind: 'collection',
         titleField: 'name',
         fields: {
            name: { label: 'Name', type: 'text', required: true },
         },
      },
      events: {
         id: 'events',
         label: 'Events',
         kind: 'collection',
         titleField: 'title',
         drafts: true,
         fields: {
            title: { label: 'Title', type: 'text', required: true },
            slug: { label: 'Slug', type: 'slug', from: 'title', required: true },
            description: { label: 'Description', type: 'richtext', translatable: true },
            seats: { label: 'Seats', type: 'number', integer: true },
            date: { label: 'Date', type: 'date', required: true },
            featured: { label: 'Featured', type: 'boolean' },
            visibility: { label: 'Visibility', type: 'select', options: ['public', 'hidden'] },
            contactEmail: { label: 'Contact email', type: 'email' },
            metadata: { label: 'Metadata', type: 'json' },
            poster: { label: 'Poster', type: 'media', mediaType: 'image' },
            body: {
               label: 'Body',
               type: 'blocks',
               blocks: {
                  hero: {
                     label: 'Hero',
                     fields: {
                        heading: { label: 'Heading', type: 'text', required: true },
                     },
                  },
                  quote: {
                     label: 'Quote',
                     fields: {
                        text: { label: 'Text', type: 'text', required: true },
                        author: { label: 'Author', type: 'text' },
                     },
                  },
               },
            },
            category: { label: 'Category', type: 'relation', to: 'categories' },
            tags: {
               label: 'Tags',
               type: 'relation',
               to: 'categories',
               cardinality: 'many-to-many',
            },
         },
      },
      homepage: {
         id: 'homepage',
         label: 'Homepage',
         kind: 'single',
         fields: {
            heroTitle: { label: 'Hero title', type: 'text', required: true, translatable: true },
         },
      },
   }
}
