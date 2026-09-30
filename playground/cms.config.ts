import { defineCmsConfig } from '#nuxt-cms'

export default defineCmsConfig({
   pages: {
      id: 'pages',
      label: 'Pages',
      kind: 'page',
      icon: 'window',
      exclude: ['/cms'],
      labels: { '/': 'Home' },
      order: ['/', '/about'],
      tabs: [
         { id: 'texts', label: 'Texts' },
         { id: 'images', label: 'Images' },
         { id: 'seo', label: 'SEO' },
      ],
      fields: {
         title: {
            label: 'Title',
            type: 'text',
            translatable: true,
            placeholder: 'Page title',
         },
         subtitle: {
            label: 'Subtitle',
            type: 'text',
            translatable: true,
            description: 'One short line under the title.',
         },
         cover: {
            label: 'Cover',
            type: 'media',
            mediaType: ['image', 'video'],
            mobile: true,
            tab: 'images',
            description: 'The mobile version is optional. Without it, the site uses the cover.',
         },
         metaTitle: { label: 'Meta title', type: 'text', translatable: true, tab: 'seo' },
         metaDescription: {
            label: 'Meta description',
            type: 'text',
            textarea: true,
            translatable: true,
            tab: 'seo',
            description: 'About 155 characters. Search engines show it under the link.',
         },
         noIndex: { label: 'Hide from search engines', type: 'boolean', tab: 'seo' },
      },
      overrides: {
         '/about': {
            intro: { label: 'Intro', type: 'text', textarea: true, translatable: true },
            founded: { label: 'Founded in', type: 'number', integer: true },
         },
         '/guides/knots': {
            difficulty: {
               label: 'Difficulty',
               type: 'select',
               options: ['easy', 'medium', 'hard'],
            },
         },
      },
      layout: [
         ['title', 'subtitle'],
         'intro',
         ['founded', 'difficulty'],
         'cover',
         {
            title: 'Search engines',
            description: 'How the page shows up in search results.',
            rows: [['metaTitle', 'noIndex'], 'metaDescription'],
         },
      ],
   },

   homepage: {
      id: 'homepage',
      label: 'Homepage',
      kind: 'single',
      icon: 'home',
      fields: {
         heroTitle: {
            label: 'Hero title',
            type: 'text',
            required: true,
            translatable: true,
            placeholder: 'Content, served from your own server',
         },
         heroSubtitle: { label: 'Hero subtitle', type: 'text', translatable: true },
         heroImage: {
            label: 'Hero image',
            type: 'media',
            mediaType: 'image',
            translatable: true,
         },
         launchDate: { label: 'Launch date', type: 'date' },
         showCountdown: {
            label: 'Show countdown',
            type: 'boolean',
            description: 'Shows a countdown to the launch date on the home page.',
         },
         announcement: {
            label: 'Announcement',
            type: 'richtext',
            translatable: true,
            description: 'A short banner above the hero. Leave it empty to hide it.',
         },
         highlights: {
            label: 'Highlights',
            type: 'blocks',
            blocks: {
               stat: {
                  label: 'Stat',
                  fields: {
                     value: { label: 'Value', type: 'text', required: true },
                     label: { label: 'Label', type: 'text', required: true, translatable: true },
                  },
               },
               callout: {
                  label: 'Callout',
                  fields: {
                     title: { label: 'Title', type: 'text', required: true, translatable: true },
                     body: { label: 'Body', type: 'richtext', translatable: true },
                     image: { label: 'Image', type: 'media', mediaType: 'image' },
                  },
               },
            },
         },
      },
      layout: [
         ['heroTitle', 'heroSubtitle'],
         ['launchDate', 'showCountdown'],
         'heroImage',
         'announcement',
         {
            title: 'Highlights',
            description: 'Stats and callouts under the hero.',
            rows: ['highlights'],
         },
      ],
   },

   contact: {
      id: 'contact',
      label: 'Contact',
      kind: 'single',
      icon: 'envelope',
      fields: {
         email: {
            label: 'Email',
            type: 'email',
            required: true,
            placeholder: 'hello@example.com',
         },
         phone: { label: 'Phone', type: 'text', placeholder: '+39 000 000 0000' },
         address: { label: 'Address', type: 'text', textarea: true },
         bookingOpen: { label: 'Bookings open', type: 'boolean' },
         bookingUrl: {
            label: 'Booking link',
            type: 'text',
            placeholder: 'https://',
            showIf: { field: 'bookingOpen', eq: true },
            description: 'Shown only when bookings are open.',
         },
         socials: {
            label: 'Social links',
            type: 'json',
            description: 'An object like { "instagram": "https://…" }.',
         },
      },
      layout: [['email', 'phone'], 'address', ['bookingOpen', 'bookingUrl'], 'socials'],
   },

   events: {
      id: 'events',
      label: 'Events',
      kind: 'collection',
      icon: 'calendar-days',
      titleField: 'title',
      drafts: true,
      tabs: [
         { id: 'content', label: 'Content' },
         { id: 'media', label: 'Media' },
         { id: 'advanced', label: 'Advanced' },
      ],
      fields: {
         title: {
            label: 'Title',
            type: 'text',
            required: true,
            placeholder: 'Spring cup',
         },
         slug: {
            label: 'Slug',
            type: 'slug',
            from: 'title',
            required: true,
            description: 'Filled from the title. Change it only before you publish.',
         },
         description: { label: 'Description', type: 'richtext', translatable: true },
         seats: { label: 'Seats', type: 'number', integer: true, placeholder: '24' },
         price: {
            label: 'Price (EUR)',
            type: 'number',
            placeholder: '0.00',
            description: 'Leave it empty for free events.',
         },
         date: { label: 'Date', type: 'date', required: true },
         featured: { label: 'Featured', type: 'boolean' },
         visibility: {
            label: 'Visibility',
            type: 'select',
            options: ['public', 'members', 'hidden'],
         },
         species: {
            label: 'Species',
            type: 'select',
            options: ['bass', 'trout', 'pike', 'carp', 'catfish'],
            multiple: true,
         },
         contactEmail: {
            label: 'Contact email',
            type: 'email',
            showIf: { field: 'visibility', in: ['public', 'members'] },
         },
         category: { label: 'Category', type: 'relation', to: 'categories' },
         tags: { label: 'Tags', type: 'relation', to: 'tags', cardinality: 'many-to-many' },
         spot: {
            label: 'Spot',
            type: 'relation',
            to: 'spots',
            onDelete: 'set null',
         },
         poster: {
            label: 'Poster',
            type: 'media',
            mediaType: ['image', 'video'],
            tab: 'media',
         },
         brochure: {
            label: 'Brochure',
            type: 'media',
            mediaType: 'file',
            translatable: true,
            tab: 'media',
         },
         body: {
            label: 'Body',
            type: 'blocks',
            tab: 'media',
            blocks: {
               hero: {
                  label: 'Hero',
                  fields: {
                     heading: {
                        label: 'Heading',
                        type: 'text',
                        required: true,
                        translatable: true,
                     },
                     image: {
                        label: 'Image',
                        type: 'media',
                        mediaType: 'image',
                        translatable: true,
                     },
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
         metadata: {
            label: 'Metadata',
            type: 'json',
            tab: 'advanced',
            description: 'Free JSON for integrations.',
         },
         internalNotes: {
            label: 'Internal notes',
            type: 'text',
            textarea: true,
            private: true,
            tab: 'advanced',
            description: 'Private: never sent by the GraphQL API.',
         },
      },
      layout: [
         ['title', 'slug'],
         'description',
         ['seats', 'price', 'date'],
         ['category', 'spot', 'featured'],
         'tags',
         ['visibility', 'contactEmail'],
         'species',
         'poster',
         'brochure',
         'body',
         {
            title: 'Advanced',
            description: 'Data for integrations and the team.',
            collapsed: true,
            rows: ['metadata', 'internalNotes'],
         },
      ],
      list: { columns: ['title', 'date', 'category', 'featured', 'status'] },
   },

   spots: {
      id: 'spots',
      label: 'Spots',
      kind: 'collection',
      icon: 'map-pin',
      titleField: 'name',
      fields: {
         name: {
            label: 'Name',
            type: 'text',
            required: true,
            placeholder: 'Lake Iseo, north bank',
         },
         depth: {
            label: 'Depth (m)',
            type: 'number',
            placeholder: '4.5',
            description: 'Average depth in meters.',
         },
         access: {
            label: 'Access',
            type: 'select',
            options: ['boat', 'shore', 'both'],
            required: true,
         },
         bestSpecies: {
            label: 'Best species',
            type: 'select',
            options: ['bass', 'trout', 'pike', 'carp', 'catfish'],
            multiple: true,
         },
         cover: { label: 'Cover', type: 'media', mediaType: 'image', mobile: true },
         gallery: {
            label: 'Gallery',
            type: 'blocks',
            description: 'Add photos with +, drag to reorder, hover a photo to remove it.',
            blocks: {
               photo: {
                  label: 'Photo',
                  fields: {
                     image: { label: 'Image', type: 'media', mediaType: 'image', required: true },
                  },
               },
            },
         },
         coordinates: {
            label: 'Coordinates',
            type: 'json',
            description: 'An object like { "lat": 45.7, "lng": 10.1 }.',
         },
      },
      layout: [['name', 'access'], ['depth', 'bestSpecies'], 'cover', 'gallery', 'coordinates'],
      list: { columns: ['name', 'access', 'depth', 'cover'] },
   },

   categories: {
      id: 'categories',
      label: 'Categories',
      kind: 'collection',
      icon: 'folder',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
         color: {
            label: 'Color',
            type: 'select',
            options: ['green', 'blue', 'amber', 'rose'],
            description: 'Used for the badge on the site.',
         },
      },
      layout: [['name', 'color']],
   },

   tags: {
      id: 'tags',
      label: 'Tags',
      kind: 'collection',
      icon: 'hashtag',
      titleField: 'name',
      fields: {
         name: { label: 'Name', type: 'text', required: true },
      },
   },
})
