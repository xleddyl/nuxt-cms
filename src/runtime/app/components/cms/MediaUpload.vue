<template>
   <div class="flex flex-col items-center gap-2">
      <button
         type="button"
         class="cms-dropzone"
         :class="{ 'is-over': dragOver, 'is-busy': uploading }"
         :disabled="uploading"
         @click="input?.click()"
         @dragover.prevent="dragOver = true"
         @dragleave.prevent="dragOver = false"
         @drop.prevent.stop="onDrop"
      >
         <input
            ref="input"
            type="file"
            class="hidden"
            :accept="acceptAttr"
            :multiple="multiple"
            @change="onChange"
            @click.stop
         />
         <CmsIcon
            :name="uploading ? 'arrow-path' : 'cloud-arrow-up'"
            class="size-5 shrink-0"
            :class="{ 'animate-spin': uploading }"
         />
         <span class="text-sm font-medium">
            {{
               uploading
                  ? `Uploading ${Math.min(done + 1, total)} of ${total}…`
                  : multiple
                    ? 'Drop files here or click to browse'
                    : 'Drop a file here or click to browse'
            }}
         </span>
         <span v-if="!uploading" class="cms-dropzone-hint">
            <CmsIcon :name="folder ? 'folder' : 'circle-stack'" class="size-3.5" />
            {{ folder ?? 'Library root' }}
         </span>
      </button>
      <template v-if="directories && multiple && !uploading">
         <input
            ref="directoryInput"
            type="file"
            class="hidden"
            webkitdirectory
            multiple
            @change="onChange"
         />
         <CmsButton
            label="Upload a folder"
            icon="folder-arrow-down"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="directoryInput?.click()"
         />
      </template>
   </div>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { mediaTypeAccept } from '#nuxt-cms'
import { computed, ref } from '#imports'
import type { UploadTree } from '../../composables/cms-media-uploader'
import {
   uploadTreeFromDrop,
   uploadTreeFromFiles,
   useCmsMediaUploader,
} from '../../composables/cms-media-uploader'

const props = withDefaults(
   defineProps<{
      multiple?: boolean
      mediaType?: MediaType | MediaType[]
      accept?: string[]
      folder?: string | null
      directories?: boolean
   }>(),
   { mediaType: 'file', folder: null }
)

const emit = defineEmits<{ uploaded: [items: MediaItem[]] }>()

const { upload, uploading, done, total } = useCmsMediaUploader()

const input = ref<HTMLInputElement | null>(null)
const directoryInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const acceptAttr = computed(
   () => (props.accept?.length ? props.accept : mediaTypeAccept(props.mediaType))?.join(',')
)

async function handleTree(pending: UploadTree | Promise<UploadTree>) {
   const tree = await pending
   const items = await upload(tree, {
      folder: props.folder,
      accept: acceptAttr.value,
      multiple: props.multiple,
   })
   if (items.length || (props.directories && tree.directories.length)) emit('uploaded', items)
}

function onChange(event: Event) {
   const el = event.target as HTMLInputElement
   if (el.files?.length) void handleTree(uploadTreeFromFiles(el.files))
   el.value = ''
}

function onDrop(event: DragEvent) {
   dragOver.value = false
   if (!event.dataTransfer?.files.length) return
   void handleTree(
      props.directories
         ? uploadTreeFromDrop(event.dataTransfer)
         : uploadTreeFromFiles(event.dataTransfer.files)
   )
}
</script>
