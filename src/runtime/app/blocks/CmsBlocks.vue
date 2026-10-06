<template>
   <component
      :is="block.component"
      v-for="block in resolved"
      :key="block.key"
      v-bind="annotate ? { ...block.props, ...annotation(block) } : block.props"
   />
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import type { CmsBlockEntryName } from '#cms-types'
import { computed } from '#imports'
import type { CmsBlockItem, ResolvedCmsBlock } from './resolve'
import { cmsBlockTypeName, resolveCmsBlocks } from './resolve'

const props = defineProps({
   blocks: { type: Array as PropType<readonly CmsBlockItem[] | null>, default: null },
   entry: { type: String as PropType<CmsBlockEntryName>, default: undefined },
   field: { type: String, default: undefined },
   annotate: { type: Boolean, default: false },
})

function warnMissing(item: CmsBlockItem) {
   if (!import.meta.dev) return
   const name = cmsBlockTypeName(item, props.entry, props.field) ?? item.type
   console.warn(
      `[nuxt-cms] <CmsBlocks> has no component for block '${name}': set component on the block in cms.config, or pass entry and field when the data has no __typename`
   )
}

const resolved = computed(() =>
   resolveCmsBlocks(props.blocks, {
      entry: props.entry,
      field: props.field,
      onMissing: warnMissing,
   })
)

function annotation(block: ResolvedCmsBlock) {
   return { 'data-cms-block': block.index, 'data-cms-block-type': block.type }
}
</script>
