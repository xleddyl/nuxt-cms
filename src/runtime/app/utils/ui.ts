import type { InjectionKey, Reactive } from 'vue'

export const CMS_FIELD_UI = { label: 'text-[13px] font-medium text-(--ui-text-toned)' }

export const CMS_MODAL_UI = {
   content: 'rounded-2xl shadow-xl sm:max-w-3xl',
   title: 'cms-display text-xl font-medium text-(--ui-text-highlighted)',
}

/** Shared reactive map of field-name -> error message, provided by CmsForm and
 *  read by CmsFormField to render inline validation errors. */
export const CMS_FORM_ERRORS: InjectionKey<Reactive<Record<string, string>>> =
   Symbol('cms-form-errors')

export function errorMessage(error: unknown): string | undefined {
   const err = error as { data?: { message?: string }; message?: string }
   return err.data?.message ?? err.message
}
