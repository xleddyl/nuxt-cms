<template>
   <CmsInput
      :model-value="(model ?? '') as string"
      size="lg"
      class="w-full font-mono"
      @update:model-value="
         (v) => {
            model = (v as string) || null
            touched = true
         }
      "
   >
      <template v-if="source !== undefined" #trailing>
         <CmsButton
            icon="arrow-path"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="regenerate"
         />
      </template>
   </CmsInput>
</template>

<script setup lang="ts">
import { ref, watch } from '#imports'
import { slugify } from '#nuxt-cms'

const props = defineProps<{ source?: string | null }>()

const model = defineModel<string | null>({ required: true })

const touched = ref(!!model.value)

watch(
   () => props.source,
   (value) => {
      if (touched.value) return
      model.value = value ? slugify(value) : null
   }
)

function regenerate() {
   model.value = props.source ? slugify(props.source) : null
   touched.value = false
}
</script>
