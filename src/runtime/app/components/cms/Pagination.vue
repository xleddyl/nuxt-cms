<template>
   <div class="cms-pagination">
      <button
         type="button"
         class="cms-page-btn"
         :disabled="page <= 1"
         aria-label="Previous page"
         @click="go(page - 1)"
      >
         <CmsIcon name="chevron-left" class="size-4" />
      </button>
      <button
         v-for="p in pages"
         :key="p"
         type="button"
         class="cms-page-btn"
         :class="{ 'is-active': p === page }"
         @click="go(p)"
      >
         {{ p }}
      </button>
      <button
         type="button"
         class="cms-page-btn"
         :disabled="page >= pageCount"
         aria-label="Next page"
         @click="go(page + 1)"
      >
         <CmsIcon name="chevron-right" class="size-4" />
      </button>
   </div>
</template>

<script setup lang="ts">
import { computed } from '#imports'

const props = defineProps<{
   total: number
   itemsPerPage: number
}>()

const page = defineModel<number>('page', { default: 1 })

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.itemsPerPage)))

// Windowed page list: at most 7 buttons centered on the current page.
const pages = computed(() => {
   const count = pageCount.value
   if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)
   const start = Math.min(Math.max(page.value - 3, 1), count - 6)
   return Array.from({ length: 7 }, (_, index) => start + index)
})

function go(target: number) {
   if (target >= 1 && target <= pageCount.value) page.value = target
}
</script>
