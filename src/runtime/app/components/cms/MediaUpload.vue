<template>
   <button
      type="button"
      class="cms-dropzone"
      :class="{ 'is-dense': dense, 'is-over': dragOver, 'is-busy': uploading }"
      :disabled="uploading"
      @click="input?.click()"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
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
      <span class="text-[13px] font-medium">
         {{
            uploading
               ? `Uploading ${Math.min(done + 1, total)} of ${total}…`
               : multiple
                 ? 'Drop files here or click to browse'
                 : 'Drop a file here or click to browse'
         }}
      </span>
   </button>
</template>

<script setup lang="ts">
import type { MediaItem, MediaType } from '#nuxt-cms'
import { computed, ref } from '#imports'
import { useCmsToast } from '../../composables/cms-toast'

const props = withDefaults(
   defineProps<{
      multiple?: boolean
      mediaType?: MediaType
      accept?: string[]
      dense?: boolean
   }>(),
   { mediaType: 'file' }
)

const emit = defineEmits<{ uploaded: [items: MediaItem[]] }>()

const toast = useCmsToast()

interface PresignResponse {
   key: string
   uploadUrl: string
   headers: Record<string, string>
   publicUrl: string | null
}

async function imageDimensions(file: File): Promise<{ width?: number; height?: number }> {
   if (!file.type.startsWith('image/')) return {}
   try {
      const bitmap = await createImageBitmap(file)
      const dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dims
   } catch {
      return {}
   }
}

const input = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const uploading = ref(false)
const done = ref(0)
const total = ref(0)

const acceptAttr = computed(() =>
   props.accept?.length
      ? props.accept.join(',')
      : props.mediaType === 'image'
        ? 'image/*'
        : props.mediaType === 'video'
          ? 'video/*'
          : undefined
)

function matchesAccept(file: File) {
   if (!acceptAttr.value) return true
   return acceptAttr.value.split(',').some((raw) => {
      const pattern = raw.trim().toLowerCase()
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1))
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
      return file.type.toLowerCase() === pattern
   })
}

const MAX_FILE_SIZE = 10 * 1024 * 1024

async function uploadOne(file: File) {
   const presign = await $fetch<PresignResponse>('/api/cms/admin/media/presign', {
      method: 'POST',
      body: {
         filename: file.name,
         contentType: file.type || 'application/octet-stream',
         size: file.size,
      },
   })
   const res = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: presign.headers,
      body: file,
   })
   if (!res.ok) throw new Error(`Upload failed (${res.status})`)
   const item = await $fetch<MediaItem>('/api/cms/admin/media', {
      method: 'POST',
      body: {
         key: presign.key,
         mime: file.type || null,
         size: file.size,
         ...(await imageDimensions(file)),
      },
   })
   done.value++
   return item
}

async function handleFiles(list: FileList) {
   let files = Array.from(list).filter(matchesAccept)
   const tooLarge = files.filter((file) => file.size > MAX_FILE_SIZE)
   for (const file of tooLarge) {
      toast.add({ title: `File too large (max 10 MB): ${file.name}`, color: 'error' })
   }
   files = files.filter((file) => file.size <= MAX_FILE_SIZE)
   if (!props.multiple) files = files.slice(0, 1)
   if (!files.length || uploading.value) return

   uploading.value = true
   done.value = 0
   total.value = files.length
   try {
      const results = await Promise.allSettled(files.map(uploadOne))
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      const failed = results.length - ok.length
      if (failed)
         toast.add({ title: `${failed} upload${failed > 1 ? 's' : ''} failed`, color: 'error' })
      if (ok.length) emit('uploaded', ok)
   } finally {
      uploading.value = false
   }
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
