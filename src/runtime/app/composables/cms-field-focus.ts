import { nextTick, onBeforeUnmount, ref } from '#imports'

const HIGHLIGHT_MS = 2400

export function useCmsFieldFocus() {
   const highlighted = ref<string | null>(null)
   let timer: ReturnType<typeof setTimeout> | undefined

   function reveal(root: () => HTMLElement | null | undefined, key: string) {
      void nextTick(() => {
         const element = root()?.querySelector<HTMLElement>(`[data-cms-field="${CSS.escape(key)}"]`)
         if (!element) return
         element.scrollIntoView({ block: 'center', behavior: 'smooth' })
         highlighted.value = key
         clearTimeout(timer)
         timer = setTimeout(() => {
            highlighted.value = null
         }, HIGHLIGHT_MS)
      })
   }

   onBeforeUnmount(() => clearTimeout(timer))

   return { highlighted, reveal }
}
