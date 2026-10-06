import type { InjectionKey, Reactive } from 'vue'
import type { FieldConfig, FieldType } from '#nuxt-cms'

export const CMS_FORM_ERRORS: InjectionKey<Reactive<Record<string, string>>> =
   Symbol('cms-form-errors')

export function errorMessage(error: unknown): string | undefined {
   const err = error as { data?: { message?: string }; message?: string }
   return err.data?.message ?? err.message
}

const FIELD_ICONS: Record<FieldType, string> = {
   text: 'bars-3-bottom-left',
   richtext: 'document-text',
   number: 'hashtag',
   boolean: 'check-circle',
   date: 'calendar',
   email: 'at-symbol',
   slug: 'link',
   select: 'chevron-up-down',
   json: 'code-bracket',
   media: 'photo',
   relation: 'arrows-right-left',
   blocks: 'squares-2x2',
}

export function fieldIcon(field: FieldConfig) {
   if (field.type === 'select' && field.multiple) return 'list-bullet'
   return FIELD_ICONS[field.type]
}
