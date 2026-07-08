import { useState } from '#imports'

export interface CmsToast {
   id: number
   title: string
   description?: string
   color?: 'success' | 'error'
}

let counter = 0

export function useCmsToastState() {
   return useState<CmsToast[]>('cms-toasts', () => [])
}

export function useCmsToast() {
   const toasts = useCmsToastState()

   function remove(id: number) {
      toasts.value = toasts.value.filter((toast) => toast.id !== id)
   }

   function add(toast: Omit<CmsToast, 'id'>) {
      const id = ++counter
      toasts.value = [...toasts.value, { id, ...toast }]
      if (import.meta.client) setTimeout(() => remove(id), 4000)
      return { id }
   }

   return { add, remove }
}
