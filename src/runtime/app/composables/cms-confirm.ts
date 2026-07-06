import { useOverlay } from '#imports'
import ConfirmModal from '../components/cms/ConfirmModal.vue'

export function useCmsConfirm() {
   const overlay = useOverlay()
   const modal = overlay.create(ConfirmModal)
   return async (message: string, options?: { title?: string; confirmLabel?: string }) =>
      (await modal.open({ message, ...options })) === true
}
