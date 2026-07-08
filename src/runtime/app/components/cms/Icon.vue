<template>
   <component :is="icon" v-if="icon" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, shallowRef, watch } from '#imports'

const props = defineProps<{ name: string }>()

const icon = shallowRef()

watch(
   () => props.name,
   (name) => {
      icon.value = name
         ? defineAsyncComponent(() => import(`../../../assets/svg/${name}.svg?component`))
         : undefined
   },
   { immediate: true }
)
</script>
