<template>
   <div class="cms-folder-picker">
      <CmsInput
         v-if="folders.length > 8"
         v-model="query"
         size="sm"
         icon="magnifying-glass"
         placeholder="Find a folder…"
      />
      <div class="cms-folder-picker-list" role="listbox">
         <button
            v-if="!query"
            type="button"
            role="option"
            class="cms-folder-picker-row"
            :class="{ 'is-active': model === null }"
            :aria-selected="model === null"
            :disabled="isDisabled(null)"
            @click="model = null"
         >
            <CmsIcon name="home" class="size-4" />
            <span class="truncate">Library root</span>
            <CmsIcon v-if="model === null" name="check" class="cms-folder-picker-check size-4" />
         </button>
         <button
            v-for="folder in visible"
            :key="folder"
            type="button"
            role="option"
            class="cms-folder-picker-row"
            :class="{ 'is-active': model === folder }"
            :style="
               query ? undefined : { paddingLeft: `${0.625 + mediaFolderDepth(folder) * 1}rem` }
            "
            :aria-selected="model === folder"
            :disabled="isDisabled(folder)"
            @click="model = folder"
         >
            <CmsIcon :name="model === folder ? 'folder-open' : 'folder'" class="size-4" />
            <span class="truncate">{{ query ? folder : mediaFolderName(folder) }}</span>
            <CmsIcon v-if="model === folder" name="check" class="cms-folder-picker-check size-4" />
         </button>
         <p v-if="query && !visible.length" class="cms-folder-picker-empty">No matching folders</p>
      </div>
   </div>
</template>

<script setup lang="ts">
import { computed, ref } from '#imports'
import { isWithinMediaFolder, mediaFolderDepth, mediaFolderName } from '#nuxt-cms'

const props = defineProps<{
   folders: string[]
   exclude?: string | null
   disabled?: (string | null)[]
}>()

const model = defineModel<string | null>({ default: null })

const query = ref('')

const visible = computed(() => {
   const term = query.value.trim().toLowerCase()
   return term ? props.folders.filter((folder) => folder.includes(term)) : props.folders
})

function isDisabled(folder: string | null) {
   if (props.disabled?.includes(folder)) return true
   return !!props.exclude && !!folder && isWithinMediaFolder(folder, props.exclude)
}
</script>
