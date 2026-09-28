import type { MediaItem } from '../../shared/index'
import { formatFileSize } from '../../shared/index'
import { ref } from '#imports'
import { useCmsRuntime } from './cms-runtime'
import { useCmsToast } from './cms-toast'

interface PresignResponse {
   key: string
   folder: string | null
   uploadUrl: string
   headers: Record<string, string>
   publicUrl: string | null
}

interface Dimensions {
   width?: number
   height?: number
}

async function imageDimensions(file: File): Promise<Dimensions> {
   try {
      const bitmap = await createImageBitmap(file)
      const dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dims
   } catch {
      return {}
   }
}

function videoDimensions(file: File): Promise<Dimensions> {
   return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      const settle = (dims: Dimensions) => {
         URL.revokeObjectURL(url)
         resolve(dims)
      }
      video.preload = 'metadata'
      video.muted = true
      video.onloadedmetadata = () =>
         settle(
            video.videoWidth && video.videoHeight
               ? { width: video.videoWidth, height: video.videoHeight }
               : {}
         )
      video.onerror = () => settle({})
      video.src = url
   })
}

async function mediaDimensions(file: File): Promise<Dimensions> {
   if (file.type.startsWith('image/')) return imageDimensions(file)
   if (file.type.startsWith('video/')) return videoDimensions(file)
   return {}
}

export function matchesAccept(file: File, accept: string | undefined) {
   if (!accept) return true
   return accept.split(',').some((raw) => {
      const pattern = raw.trim().toLowerCase()
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1))
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
      return file.type.toLowerCase() === pattern
   })
}

export function useCmsMediaUploader() {
   const toast = useCmsToast()
   const { mediaMaxFileSize } = useCmsRuntime()

   const uploading = ref(false)
   const done = ref(0)
   const total = ref(0)

   async function uploadOne(file: File, folder: string | null) {
      const presign = await $fetch<PresignResponse>('/api/cms/admin/media/presign', {
         method: 'POST',
         body: {
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            folder,
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
            folder: presign.folder,
            mime: file.type || null,
            size: file.size,
            ...(await mediaDimensions(file)),
         },
      })
      done.value++
      return item
   }

   async function upload(
      list: FileList | File[],
      options: { folder: string | null; accept?: string; multiple?: boolean }
   ): Promise<MediaItem[]> {
      const all = Array.from(list)
      let files = all.filter((file) => matchesAccept(file, options.accept))
      const rejected = all.length - files.length
      if (rejected) {
         toast.add({
            title: `${rejected} file${rejected > 1 ? 's' : ''} of an unsupported type skipped`,
            color: 'error',
         })
      }
      for (const file of files.filter((file) => file.size > mediaMaxFileSize)) {
         toast.add({
            title: `File too large (max ${formatFileSize(mediaMaxFileSize)}): ${file.name}`,
            color: 'error',
         })
      }
      files = files.filter((file) => file.size <= mediaMaxFileSize)
      if (options.multiple === false) files = files.slice(0, 1)
      if (!files.length || uploading.value) return []

      uploading.value = true
      done.value = 0
      total.value = files.length
      try {
         const results = await Promise.allSettled(
            files.map((file) => uploadOne(file, options.folder))
         )
         const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
         const failed = results.length - ok.length
         if (failed)
            toast.add({ title: `${failed} upload${failed > 1 ? 's' : ''} failed`, color: 'error' })
         return ok
      } finally {
         uploading.value = false
      }
   }

   return { upload, uploading, done, total }
}
