import { useState } from '#imports'

export interface CmsConfirmState {
   open: boolean
   message: string
   title?: string
   confirmLabel?: string
   resolve?: (value: boolean) => void
}

export function useCmsConfirmState() {
   return useState<CmsConfirmState>('cms-confirm', () => ({ open: false, message: '' }))
}

export function useCmsConfirm() {
   const state = useCmsConfirmState()
   return (message: string, options?: { title?: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
         state.value = {
            open: true,
            message,
            title: options?.title,
            confirmLabel: options?.confirmLabel,
            resolve,
         }
      })
}
