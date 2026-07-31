import type { InjectionKey, Reactive } from 'vue'

/** Shared reactive map of field-name -> error message, provided by CmsForm and
 *  read by CmsFormField to render inline validation errors. */
export const CMS_FORM_ERRORS: InjectionKey<Reactive<Record<string, string>>> =
   Symbol('cms-form-errors')

export function errorMessage(error: unknown): string | undefined {
   const err = error as { data?: { message?: string }; message?: string }
   return err.data?.message ?? err.message
}
