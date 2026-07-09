<template>
   <component :is="icon" v-if="icon" class="size-5 stroke-[1.5]" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, shallowRef, watch } from '#imports'

const props = defineProps<{ name: string }>()

type SvgGlob = (
   pattern: string,
   options: { query: string; import: string }
) => Record<string, () => Promise<unknown>>

const icons = (import.meta as unknown as { glob: SvgGlob }).glob('../../../assets/svg/*.svg', {
   query: '?component',
   import: 'default',
})

const icon = shallowRef()

watch(
   () => props.name,
   (name) => {
      const loader = name ? icons[`../../../assets/svg/${name}.svg`] : undefined
      icon.value = loader ? defineAsyncComponent(loader as never) : undefined
   },
   { immediate: true }
)
</script>
