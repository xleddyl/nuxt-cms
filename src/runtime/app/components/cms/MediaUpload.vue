<template>
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
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { mediaTypeAccept } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { useCmsMediaUploader } from '../../composables/cms-media-uploader'

const props = withDefaults(
   defineProps<{
      multiple?: boolean
      mediaType?: MediaType | MediaType[]
      accept?: string[]
      folder?: string | null
   }>(),
   { mediaType: 'file', folder: null }
)

const emit = defineEmits<{ uploaded: [items: MediaItem[]] }>()

const { upload, uploading, done, total } = useCmsMediaUploader()

const input = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const acceptAttr = computed(
   () => (props.accept?.length ? props.accept : mediaTypeAccept(props.mediaType))?.join(',')
)

async function handleFiles(list: FileList) {
   const items = await upload(list, {
      folder: props.folder,
      accept: acceptAttr.value,
      multiple: props.multiple,
   })
   if (items.length) emit('uploaded', items)
}

function onChange(event: Event) {
   const el = event.target as HTMLInputElement
   if (el.files?.length) void handleFiles(el.files)
   el.value = ''
}

function onDrop(event: DragEvent) {
   dragOver.value = false
   if (event.dataTransfer?.files.length) void handleFiles(event.dataTransfer.files)
}
</script>
