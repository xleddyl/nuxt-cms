<template>
   <div class="cms-palette" role="group" :aria-label="label">
      <button
         v-for="(block, type) in blocks"
         :key="type"
         type="button"
         class="cms-palette-item"
         @click="emit('pick', String(type))"
      >
         <span class="cms-palette-icon">
            <CmsIcon :name="block.icon ?? 'rectangle-stack'" class="size-4" />
         </span>
         <span class="cms-palette-text">
            <span class="cms-palette-label">{{ block.label }}</span>
            <span v-if="block.description" class="cms-palette-description">
               {{ block.description }}
            </span>
         </span>
      </button>
   </div>
</template>

<script setup lang="ts">
import type { BlockConfig } from '#nuxt-cms'

withDefaults(defineProps<{ blocks: Record<string, BlockConfig>; label?: string }>(), {
   label: 'Available blocks',
})

const emit = defineEmits<{ pick: [type: string] }>()
</script>
