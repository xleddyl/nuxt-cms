<template>
   <div class="flex flex-col gap-2">
      <div v-if="i18n.locales.length > 1" class="flex items-center gap-1">
         <UButton
            v-for="locale in i18n.locales"
            :key="locale"
            size="xs"
            :variant="active === locale ? 'soft' : 'ghost'"
            color="neutral"
            class="font-mono uppercase"
            @click="
               () => {
                  active = locale
               }
            "
         >
            {{ locale }}
            <span
               class="size-1.5 rounded-full"
               :class="hasContent(locale) ? 'bg-(--cms-fern)' : 'bg-(--cms-line)'"
            />
         </UButton>
         <span
            v-if="props.field.required && active === i18n.defaultLocale"
            class="text-(--ui-text-muted) ml-auto font-mono text-xs"
         >
            {{ i18n.defaultLocale }} *
         </span>
      </div>
      <CmsRichTextField v-if="props.field.type === 'richtext'" v-model="current" />
      <UTextarea
         v-else-if="props.field.textarea"
         v-model="current"
         :rows="4"
         size="lg"
         class="w-full"
      />
      <UInput v-else v-model="current" size="lg" class="w-full" />
   </div>
</template>

<script setup lang="ts">
import type { FieldConfig } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ field: FieldConfig }>()

const model = defineModel<Record<string, string> | null>({ required: true })

const { i18n } = useCmsRuntime()

const active = ref(i18n.defaultLocale)

const current = computed({
   get: () => model.value?.[active.value] ?? '',
   set: (value: string | null) => {
      const next = Object.fromEntries(
         Object.entries(model.value ?? {}).filter(([locale]) => locale !== active.value)
      )
      if (value != null && value !== '') next[active.value] = value
      model.value = Object.keys(next).length ? next : null
   },
})

function hasContent(locale: string) {
   return !!model.value?.[locale]?.trim()
}
</script>
