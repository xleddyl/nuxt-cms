import { useState } from '#imports'

export interface CmsConfirmLink {
   title: string
   meta: string
   to: string
}

export interface CmsConfirmGroup {
   title: string
   links: CmsConfirmLink[]
}

export interface CmsConfirmOptions {
   title?: string
   confirmLabel?: string
   groups?: CmsConfirmGroup[]
}

export interface CmsConfirmState extends CmsConfirmOptions {
   open: boolean
   message: string
   resolve?: (value: boolean) => void
}

export function useCmsConfirmState() {
   return useState<CmsConfirmState>('cms-confirm', () => ({ open: false, message: '' }))
}

export function useCmsConfirm() {
   const state = useCmsConfirmState()
   return (message: string, options?: CmsConfirmOptions) =>
      new Promise<boolean>((resolve) => {
         state.value = {
            open: true,
            message,
            title: options?.title,
            confirmLabel: options?.confirmLabel,
            groups: options?.groups,
            resolve,
         }
      })
}
