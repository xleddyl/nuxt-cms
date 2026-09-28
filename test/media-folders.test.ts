import { describe, expect, it } from 'vitest'
import {
   expandMediaFolders,
   isWithinMediaFolder,
   mediaFolderAncestors,
   mediaFolderDepth,
   mediaFolderName,
   mediaFolderParent,
   mediaFolderSegments,
   rebaseMediaFolder,
} from '../src/runtime/shared/index'

describe('media folder paths', () => {
   it('splits a path into its parent, name and depth', () => {
      expect(mediaFolderParent('blog/covers/2026')).toBe('blog/covers')
      expect(mediaFolderParent('blog')).toBeNull()
      expect(mediaFolderName('blog/covers')).toBe('covers')
      expect(mediaFolderName('blog')).toBe('blog')
      expect(mediaFolderDepth('blog/covers')).toBe(2)
      expect(mediaFolderDepth(null)).toBe(0)
   })

   it('lists every ancestor from the top down', () => {
      expect(mediaFolderAncestors('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
   })

   it('keeps every segment without the depth limit', () => {
      expect(mediaFolderSegments('/A/b c/d/e/f/')).toEqual(['a', 'b-c', 'd', 'e', 'f'])
      expect(mediaFolderSegments(null)).toEqual([])
   })

   it('checks if a folder is inside another one', () => {
      expect(isWithinMediaFolder('blog/covers', 'blog')).toBe(true)
      expect(isWithinMediaFolder('blog', 'blog')).toBe(true)
      expect(isWithinMediaFolder('blogs', 'blog')).toBe(false)
      expect(isWithinMediaFolder(null, 'blog')).toBe(false)
      expect(isWithinMediaFolder(null, null)).toBe(true)
   })

   it('moves a folder and its subfolders to a new path', () => {
      expect(rebaseMediaFolder('blog', 'blog', 'news')).toBe('news')
      expect(rebaseMediaFolder('blog/covers', 'blog', 'archive/news')).toBe('archive/news/covers')
      expect(rebaseMediaFolder('blogs/covers', 'blog', 'news')).toBe('blogs/covers')
   })

   it('adds the implicit parent folders and removes duplicates', () => {
      expect(expandMediaFolders(['b/c', null, 'a', 'b/c/d', undefined, 'a'])).toEqual([
         'a',
         'b',
         'b/c',
         'b/c/d',
      ])
   })
})
