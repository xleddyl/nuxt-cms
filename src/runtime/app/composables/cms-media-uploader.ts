import type { MediaItem } from '../../shared/index'
import {
   formatFileSize,
   MEDIA_FOLDER_MAX_DEPTH,
   mediaFolderSegments,
   normalizeMediaFolder,
} from '../../shared/index'
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

function matchesAccept(file: File, accept: string | undefined) {
   if (!accept) return true
   return accept.split(',').some((raw) => {
      const pattern = raw.trim().toLowerCase()
      if (pattern.endsWith('/*')) return file.type.toLowerCase().startsWith(pattern.slice(0, -1))
      if (pattern.startsWith('.')) return file.name.toLowerCase().endsWith(pattern)
      return file.type.toLowerCase() === pattern
   })
}

export interface UploadEntry {
   file: File
   directory: string | null
}

export interface UploadTree {
   files: UploadEntry[]
   directories: string[]
}

const UPLOAD_CONCURRENCY = 4

function isHiddenName(name: string) {
   return name.startsWith('.')
}

function joinPath(parent: string | null, name: string) {
   return parent ? `${parent}/${name}` : name
}

export function uploadTreeFromFiles(list: FileList | File[]): UploadTree {
   const files: UploadEntry[] = []
   const directories = new Set<string>()
   for (const file of Array.from(list)) {
      const segments = (file.webkitRelativePath || file.name).split('/').filter(Boolean)
      if (segments.some(isHiddenName)) continue
      const directory = segments.slice(0, -1).join('/') || null
      if (directory) directories.add(directory)
      files.push({ file, directory })
   }
   return { files, directories: [...directories] }
}

function readDirectory(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
   const reader = entry.createReader()
   const all: FileSystemEntry[] = []
   return new Promise((resolve, reject) => {
      const next = () =>
         reader.readEntries((batch) => {
            if (!batch.length) return resolve(all)
            all.push(...batch)
            next()
         }, reject)
      next()
   })
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
   return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function walkEntry(entry: FileSystemEntry, parent: string | null, tree: UploadTree) {
   if (isHiddenName(entry.name)) return
   if (entry.isFile) {
      tree.files.push({ file: await entryFile(entry as FileSystemFileEntry), directory: parent })
      return
   }
   if (!entry.isDirectory) return
   const directory = joinPath(parent, entry.name)
   tree.directories.push(directory)
   const children = await readDirectory(entry as FileSystemDirectoryEntry)
   for (const child of children) await walkEntry(child, directory, tree)
}

export function uploadTreeFromDrop(dataTransfer: DataTransfer): Promise<UploadTree> {
   const files = Array.from(dataTransfer.files)
   const entries = Array.from(dataTransfer.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.webkitGetAsEntry?.() ?? null)
      .filter((entry): entry is FileSystemEntry => !!entry)
   if (!entries.some((entry) => entry.isDirectory)) {
      return Promise.resolve(uploadTreeFromFiles(files))
   }
   return (async () => {
      const tree: UploadTree = { files: [], directories: [] }
      for (const entry of entries) await walkEntry(entry, null, tree)
      return tree
   })()
}

async function mapWithConcurrency<T, R>(
   list: T[],
   limit: number,
   task: (value: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
   const results: PromiseSettledResult<R>[] = new Array(list.length)
   let cursor = 0
   const worker = async () => {
      while (cursor < list.length) {
         const index = cursor++
         try {
            results[index] = { status: 'fulfilled', value: await task(list[index]!) }
         } catch (reason) {
            results[index] = { status: 'rejected', reason }
         }
      }
   }
   await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
   return results
}

function targetFolder(base: string | null, directory: string | null) {
   const joined = [base, directory].filter(Boolean).join('/')
   return {
      folder: normalizeMediaFolder(joined),
      flattened: mediaFolderSegments(joined).length > MEDIA_FOLDER_MAX_DEPTH,
   }
}

function isWithinOrAbove(folder: string, other: string) {
   return other === folder || other.startsWith(`${folder}/`)
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

   async function createFolders(folders: string[]) {
      const results = await mapWithConcurrency(folders, UPLOAD_CONCURRENCY, (name) =>
         $fetch<{ folder: string }>('/api/cms/admin/media/folders', {
            method: 'POST',
            body: { name },
         })
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed)
         toast.add({
            title: `${failed} folder${failed > 1 ? 's' : ''} could not be created`,
            color: 'error',
         })
   }

   async function upload(
      source: FileList | File[] | UploadTree,
      options: { folder: string | null; accept?: string; multiple?: boolean }
   ): Promise<MediaItem[]> {
      const tree =
         Array.isArray(source) || source instanceof FileList ? uploadTreeFromFiles(source) : source
      const all = tree.files
      let files = all.filter((entry) => matchesAccept(entry.file, options.accept))
      const rejected = all.length - files.length
      if (rejected) {
         toast.add({
            title: `${rejected} file${rejected > 1 ? 's' : ''} of an unsupported type skipped`,
            color: 'error',
         })
      }
      for (const { file } of files.filter((entry) => entry.file.size > mediaMaxFileSize)) {
         toast.add({
            title: `File too large (max ${formatFileSize(mediaMaxFileSize)}): ${file.name}`,
            color: 'error',
         })
      }
      files = files.filter((entry) => entry.file.size <= mediaMaxFileSize)
      const nested = options.multiple !== false
      if (!nested) files = files.slice(0, 1).map((entry) => ({ ...entry, directory: null }))
      const directories = nested ? tree.directories : []
      if ((!files.length && !directories.length) || uploading.value) return []

      const planned = files.map((entry) => ({
         file: entry.file,
         ...targetFolder(options.folder, entry.directory),
      }))
      const fileFolders = planned.map((entry) => entry.folder).filter((f): f is string => !!f)
      const emptyFolders = [
         ...new Set(
            directories
               .map((directory) => targetFolder(options.folder, directory).folder)
               .filter((folder): folder is string => !!folder)
         ),
      ].filter((folder) => !fileFolders.some((other) => isWithinOrAbove(folder, other)))
      if (planned.some((entry) => entry.flattened)) {
         toast.add({
            title: `Folders nest up to ${MEDIA_FOLDER_MAX_DEPTH} levels`,
            description: 'Files in deeper folders were uploaded to the deepest allowed folder.',
         })
      }

      uploading.value = true
      done.value = 0
      total.value = planned.length
      try {
         if (emptyFolders.length) await createFolders(emptyFolders)
         const results = await mapWithConcurrency(planned, UPLOAD_CONCURRENCY, (entry) =>
            uploadOne(entry.file, entry.folder)
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
