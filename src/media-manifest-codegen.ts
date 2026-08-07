import type { MediaFileMeta } from './runtime/server/utils/media-sync'
import { readMediaFileMeta, scanMediaDirectory } from './runtime/server/utils/media-sync'

export async function collectMediaManifest(root: string): Promise<MediaFileMeta[]> {
   const files = await scanMediaDirectory(root)
   return Promise.all(files.map((file) => readMediaFileMeta(root, file)))
}

export function renderMediaManifestFile(files: MediaFileMeta[] | null): string {
   return [
      `export const generated = ${files !== null}`,
      ``,
      `export const files = ${JSON.stringify(files ?? [], null, 3)}`,
      ``,
   ].join('\n')
}

export function renderMediaManifestTypes(typesPath: string): string {
   return [
      `import type { MediaFileMeta } from '${typesPath}'`,
      ``,
      `export declare const generated: boolean`,
      ``,
      `export declare const files: MediaFileMeta[]`,
      ``,
   ].join('\n')
}
