import type { Ref } from 'vue'
import { nextTick, useCookie } from '#imports'

export type CmsTheme = 'light' | 'dark' | 'system'

export const CMS_THEMES: { value: CmsTheme; label: string; icon: string }[] = [
   { value: 'light', label: 'Light', icon: 'sun' },
   { value: 'dark', label: 'Dark', icon: 'moon' },
   { value: 'system', label: 'System', icon: 'computer-desktop' },
]

export function useCmsTheme() {
   return useCookie<CmsTheme>('cms-theme', {
      default: () => 'system',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      path: '/',
   })
}

type ViewTransitionDocument = Document & {
   startViewTransition?: (update: () => Promise<void>) => unknown
}

export function setCmsTheme(theme: Ref<CmsTheme>, value: CmsTheme) {
   if (value === theme.value) return
   const doc = document as ViewTransitionDocument
   const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
   if (!doc.startViewTransition || reduced) {
      theme.value = value
      return
   }
   doc.startViewTransition(async () => {
      theme.value = value
      await nextTick()
   })
}
