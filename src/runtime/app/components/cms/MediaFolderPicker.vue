<template>
   <div class="cms-folder-picker">
      <button
         type="button"
         class="cms-pill"
         :class="{ 'is-active': model === null }"
         @click="model = null"
      >
         <CmsIcon name="circle-stack" class="size-3" />Root
      </button>
      <button
         v-for="name in folders"
         :key="name"
         type="button"
         class="cms-pill"
         :class="{ 'is-active': model === name }"
         @click="model = name"
      >
         <CmsIcon name="folder" class="size-3" />{{ name }}
      </button>
      <template v-if="creating">
         <CmsInput
            v-model="draft"
            size="sm"
            autofocus
            placeholder="Folder name"
            class="cms-folder-picker-input"
            @keydown.enter.prevent="commit"
            @keydown.esc="cancel"
         />
         <CmsButton label="Add" size="xs" :disabled="!normalized" @click="commit" />
         <CmsButton label="Cancel" size="xs" variant="ghost" color="neutral" @click="cancel" />
      </template>
      <button v-else type="button" class="cms-pill" @click="startCreating">
         <CmsIcon name="folder-plus" class="size-3" />New folder
      </button>
   </div>
</template>

<script setup lang="ts">
import { computed, ref } from '#imports'
import { normalizeMediaFolder } from '#nuxt-cms'

defineProps<{ folders: string[] }>()

const emit = defineEmits<{ create: [folder: string] }>()

const model = defineModel<string | null>({ default: null })

const creating = ref(false)
const draft = ref('')

const normalized = computed(() => normalizeMediaFolder(draft.value))

function startCreating() {
   creating.value = true
}

function cancel() {
   creating.value = false
   draft.value = ''
}

function commit() {
   const folder = normalized.value
   if (!folder) return
   emit('create', folder)
   model.value = folder
   cancel()
}
</script>
