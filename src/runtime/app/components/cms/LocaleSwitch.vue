<template>
   <div class="cms-locale-switch" role="tablist" aria-label="Content language">
      <button
         v-for="locale in i18n.locales"
         :key="locale"
         type="button"
         role="tab"
         :aria-selected="model === locale"
         :title="filled(locale) ? locale : `${locale} — empty`"
         class="cms-locale-option"
         :class="{ 'is-active': model === locale, 'is-empty': !filled(locale) }"
         @click="model = locale"
      >
         {{ locale }}
      </button>
   </div>
</template>

<script setup lang="ts">
import { useCmsRuntime } from '../../composables/cms-runtime'

const props = defineProps<{ value?: Record<string, string> | null }>()

const model = defineModel<string>({ required: true })

const { i18n } = useCmsRuntime()

function filled(locale: string) {
   return !!props.value?.[locale]?.trim()
}
</script>
