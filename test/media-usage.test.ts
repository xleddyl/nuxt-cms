import { describe, expect, it } from 'vitest'
import type { MediaUsage } from '../src/runtime/shared/index'
import { groupMediaUsage, mediaUsageGroups } from '../src/runtime/shared/index'

function use(overrides: Partial<MediaUsage>): MediaUsage {
   return {
      collection: 'posts',
      label: 'Posts',
      kind: 'collection',
      id: '7',
      title: 'Spring',
      field: 'hero',
      ...overrides,
   }
}

describe('groupMediaUsage', () => {
   it('merges the fields of the same entry', () => {
      expect(
         groupMediaUsage([
            use({ field: 'hero' }),
            use({ field: 'gallery.photo' }),
            use({ field: 'hero' }),
            use({ id: '8', title: 'Summer', field: 'hero' }),
         ])
      ).toEqual([
         {
            collection: 'posts',
            label: 'Posts',
            kind: 'collection',
            id: '7',
            title: 'Spring',
            fields: ['hero', 'gallery.photo'],
         },
         {
            collection: 'posts',
            label: 'Posts',
            kind: 'collection',
            id: '8',
            title: 'Summer',
            fields: ['hero'],
         },
      ])
   })

   it('keeps singles and entries of other collections apart', () => {
      const grouped = groupMediaUsage([
         use({}),
         use({ collection: 'home', label: 'Homepage', kind: 'single', id: null, title: null }),
         use({ collection: 'pages', label: 'Pages', kind: 'page', id: '7', title: 'About' }),
      ])
      expect(grouped.map((entry) => [entry.collection, entry.id])).toEqual([
         ['posts', '7'],
         ['home', null],
         ['pages', '7'],
      ])
   })

   it('returns nothing for unused media', () => {
      expect(groupMediaUsage([])).toEqual([])
   })
})

describe('mediaUsageGroups', () => {
   it('lists only the used keys, once each, in the order asked', () => {
      const groups = mediaUsageGroups(
         {
            'library/hero.webp': [use({}), use({ field: 'cover' })],
            'library/unused.webp': [],
            'files/en.pdf': [use({ id: '9', title: 'Guide', field: 'brochure' })],
         },
         [
            'files/en.pdf',
            'library/unused.webp',
            'library/missing.webp',
            'library/hero.webp',
            'files/en.pdf',
         ]
      )
      expect(groups.map((group) => group.key)).toEqual(['files/en.pdf', 'library/hero.webp'])
      expect(groups[1]!.entries).toEqual([
         expect.objectContaining({ id: '7', fields: ['hero', 'cover'] }),
      ])
   })
})
