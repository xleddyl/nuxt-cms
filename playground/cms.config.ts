import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   categories: {
      id: 'categories',
      label: 'Categories',
      kind: 'collection',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
      },
   },
   tags: {
      id: 'tags',
      label: 'Tags',
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
         visibility: {
            label: 'Visibility',
            type: 'select',
            options: ['public', 'members', 'hidden'],
         },
         contactEmail: { label: 'Contact email', type: 'email' },
         metadata: { label: 'Metadata', type: 'json' },
         body: {
            label: 'Body',
            type: 'blocks',
            blocks: {
               hero: {
                  label: 'Hero',
                  fields: {
                     heading: { label: 'Heading', type: 'text', required: true },
                     image: { label: 'Image', type: 'media', mediaType: 'image' },
                  },
               },
               quote: {
                  label: 'Quote',
                  fields: {
                     text: { label: 'Text', type: 'text', textarea: true, required: true },
                     author: { label: 'Author', type: 'text' },
                  },
               },
            },
         },
         poster: { label: 'Poster', type: 'media', mediaType: 'image' },
         category: { label: 'Category', type: 'relation', to: 'categories' },
         tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
      },
   },
   homepage: {
      id: 'homepage',
      label: 'Homepage',
      kind: 'single',
      fields: {
         heroTitle: { label: 'Hero title', type: 'text', required: true, translatable: true },
         heroSubtitle: { label: 'Hero subtitle', type: 'text', translatable: true },
         launchDate: { label: 'Launch date', type: 'date' },
      },
   },
})
