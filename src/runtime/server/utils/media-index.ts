import { existsSync } from 'node:fs'
import {
   builtAt as manifestBuiltAt,
   files as manifestFiles,
   generated as manifestGenerated,
} from '#cms-media-manifest'
import { useRuntimeConfig } from '#imports'
import type { MediaSourceInfo, MediaStorageMode } from '../../shared/index'
import type { MediaFileMeta, ScannedMediaFile } from './media-sync'
import { readMediaFileMeta, scanMediaDirectory } from './media-sync'

export interface MediaIndex {
   files: MediaFileMeta[]
   get: (key: string) => MediaFileMeta | undefined
   source: MediaSourceInfo
}

const FILESYSTEM_TTL = 1000

let cached: { index: MediaIndex; at: number } | null = null
const metaByKeyAndSize = new Map<string, MediaFileMeta>()

function makeIndex(files: MediaFileMeta[], source: MediaSourceInfo): MediaIndex {
   const byKey = new Map(files.map((file) => [file.key, file]))
   return { files, get: (key) => byKey.get(key), source }
}

async function readMeta(root: string, file: ScannedMediaFile): Promise<MediaFileMeta> {
   const cacheKey = `${file.key}:${file.size}`
   const hit = metaByKeyAndSize.get(cacheKey)
   if (hit) return hit
   const meta = await readMediaFileMeta(root, file)
   metaByKeyAndSize.set(cacheKey, meta)
   return meta
}

function localMediaRoot(): string {
   const { media } = useRuntimeConfig().cms as {
      media?: { storage?: MediaStorageMode; localRoot?: string }
   }
   if (media?.storage !== 'local') return ''
   return media.localRoot ?? ''
}

async function buildIndex(): Promise<MediaIndex> {
   const root = localMediaRoot()

   if (root && existsSync(root)) {
      const scanned = await scanMediaDirectory(root)
      const files = await Promise.all(scanned.map((file) => readMeta(root, file)))
      return makeIndex(files, { kind: 'filesystem', root, builtAt: null })
   }

   if (manifestGenerated) {
      return makeIndex(manifestFiles, { kind: 'manifest', root, builtAt: manifestBuiltAt })
   }

   return makeIndex([], { kind: 'none', root, builtAt: null })
}

export async function useMediaIndex(): Promise<MediaIndex> {
   const now = Date.now()
   if (cached && (cached.index.source.kind !== 'filesystem' || now - cached.at < FILESYSTEM_TTL)) {
      return cached.index
   }
   const index = await buildIndex()
   cached = { index, at: now }
   return index
}
