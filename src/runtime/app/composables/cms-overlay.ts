import { onBeforeUnmount } from '#imports'

interface CmsOverlayEntry {
   close: () => void
}

const stack: CmsOverlayEntry[] = []

function onKeydown(event: KeyboardEvent) {
   if (event.key !== 'Escape') return
   stack[stack.length - 1]?.close()
}

export function useCmsOverlay(close: () => void) {
   const entry: CmsOverlayEntry = { close }

   function activate() {
      if (import.meta.server || stack.includes(entry)) return
      stack.push(entry)
      if (stack.length === 1) document.addEventListener('keydown', onKeydown)
   }

   function deactivate() {
      if (import.meta.server) return
      const index = stack.indexOf(entry)
      if (index === -1) return
      stack.splice(index, 1)
      if (stack.length === 0) document.removeEventListener('keydown', onKeydown)
   }

   onBeforeUnmount(deactivate)

   return { activate, deactivate }
}
