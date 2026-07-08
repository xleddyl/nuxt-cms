<template>
   <div class="cms-input-wrap" :class="[$attrs.class, { 'has-lead': icon }]">
      <span v-if="icon" class="cms-input-lead">
         <CmsIcon :name="icon" class="size-4" />
      </span>
      <input
         v-bind="inputAttrs"
         :type="type ?? 'text'"
         :value="model ?? ''"
         :class="['cms-field', `cms-field-${size ?? 'md'}`, { 'is-error': color === 'error' }]"
         @input="onInput"
      />
      <span v-if="$slots.trailing" class="cms-input-trail">
         <slot name="trailing" />
      </span>
   </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from '#imports'

defineOptions({ inheritAttrs: false })

defineProps<{
   type?: string
   size?: 'sm' | 'md' | 'lg'
   icon?: string
   color?: 'error'
}>()

const [model, modifiers] = defineModel<string | number | null, 'number'>()

const attrs = useAttrs()
const inputAttrs = computed(() => {
   const { class: _class, style: _style, ...rest } = attrs
   return rest
})

function onInput(event: Event) {
   const value = (event.target as HTMLInputElement).value
   if (modifiers.number) {
      const parsed = Number.parseFloat(value)
      model.value = value === '' ? null : Number.isNaN(parsed) ? value : parsed
   } else {
      model.value = value
   }
}
</script>
