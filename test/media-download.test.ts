import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, createError, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
   cms: {} as Record<string, unknown>,
   publicCms: {} as Record<string, unknown>,
   rows: [] as { key: string; mime: string | null }[],
   indexFiles: [] as { key: string; mime: string | null }[],
   admin: true,
}))

vi.mock('#imports', () => ({
   useRuntimeConfig: () => ({ cms: state.cms, public: { cms: state.publicCms } }),
}))

vi.mock('#cms-db', () => ({
   useDb: () => ({
      select: () => ({
         from: () => ({
            where: () => ({ limit: async () => state.rows.slice(0, 1) }),
         }),
      }),
   }),
}))

vi.mock('drizzle-orm', () => ({ eq: (_column: unknown, key: string) => key }))

vi.mock('../src/runtime/server/utils/require-admin', () => ({
   requireAdmin: async () => {
      if (!state.admin)
         throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
   },
}))

vi.mock('../src/runtime/server/utils/media-index', () => ({
   useMediaIndex: async () => ({
      get: (key: string) => state.indexFiles.find((file) => file.key === key),
   }),
}))

import handler from '../src/runtime/server/api/media-download.get'
import { attachmentDisposition } from '../src/runtime/server/utils/media-download'

const web = toWebHandler(createApp().use(handler))

function download(key: string) {
   return web(
      new Request(`http://cms.test/api/cms/admin/media/download?key=${encodeURIComponent(key)}`)
   )
}

const s3Config = {
   storage: 's3',
   endpoint: 'https://s3.example.com',
   region: 'auto',
   bucket: 'bucket',
   presignExpiry: 600,
   accessKeyId: 'id',
   secretAccessKey: 'secret',
}

describe('attachmentDisposition', () => {
   it('carries an ascii fallback and the utf-8 filename', () => {
      expect(attachmentDisposition('Prezzi 2026.pdf')).toBe(
         `attachment; filename="Prezzi 2026.pdf"; filename*=UTF-8''Prezzi%202026.pdf`
      )
      expect(attachmentDisposition('Gästebuch "a"(1).png')).toBe(
         `attachment; filename="G_stebuch _a_(1).png"; filename*=UTF-8''G%C3%A4stebuch%20%22a%22%281%29.png`
      )
   })
})

describe('media download route', () => {
   beforeEach(() => {
      state.admin = true
      state.rows = []
      state.indexFiles = []
      state.publicCms = { mediaBaseUrl: '/images' }
   })

   it('requires an admin session', async () => {
      state.cms = { media: s3Config }
      state.admin = false
      expect((await download('2026/09/a.png')).status).toBe(401)
   })

   it.each(['../cms.db', 'a/../../etc/passwd', '/etc/passwd', ''])(
      'rejects the key %j',
      async (key) => {
         state.cms = { media: s3Config }
         const status = (await download(key)).status
         expect(status).toBeGreaterThanOrEqual(400)
         expect(status).toBeLessThan(500)
      }
   )

   it('answers 404 for a key that is not in the library', async () => {
      state.cms = { media: s3Config }
      expect((await download('2026/09/missing.png')).status).toBe(404)
   })

   it('answers 404 for a folder marker', async () => {
      state.cms = { media: s3Config }
      state.rows = [{ key: 'docs/.keep', mime: null }]
      expect((await download('docs/.keep')).status).toBe(404)
   })

   it('redirects s3 downloads to a presigned original with an attachment disposition', async () => {
      state.cms = { media: s3Config }
      const key = '2026/09/0b5f1c2e-1111-4222-8333-444455556666-prezzi.pdf'
      state.rows = [{ key, mime: 'application/pdf' }]
      const res = await download(key)
      expect(res.status).toBe(302)
      const location = new URL(res.headers.get('location')!)
      expect(location.origin).toBe('https://s3.example.com')
      expect(location.pathname).toBe(`/bucket/${key}`)
      expect(location.searchParams.get('response-content-disposition')).toBe(
         `attachment; filename="prezzi.pdf"; filename*=UTF-8''prezzi.pdf`
      )
      expect(location.searchParams.get('X-Amz-Signature')).toBeTruthy()
      expect(location.searchParams.has('w')).toBe(false)
   })

   describe('disk storage', () => {
      let dir: string

      beforeEach(async () => {
         dir = await mkdtemp(join(tmpdir(), 'nuxt-cms-download-'))
         await mkdir(join(dir, '2026', '09'), { recursive: true })
         await writeFile(join(dir, '2026', '09', 'photo.png'), 'original-bytes')
      })

      afterEach(() => rm(dir, { recursive: true, force: true }))

      it('streams a filesystem file as an attachment', async () => {
         state.cms = { media: { storage: 'filesystem', dir } }
         state.rows = [{ key: '2026/09/photo.png', mime: 'image/png' }]
         const res = await download('2026/09/photo.png')
         expect(res.status).toBe(200)
         expect(res.headers.get('content-type')).toBe('image/png')
         expect(res.headers.get('content-disposition')).toBe(
            `attachment; filename="photo.png"; filename*=UTF-8''photo.png`
         )
         expect(await res.text()).toBe('original-bytes')
      })

      it('answers 404 when the row exists but the file is gone', async () => {
         state.cms = { media: { storage: 'filesystem', dir } }
         state.rows = [{ key: '2026/09/gone.png', mime: 'image/png' }]
         expect((await download('2026/09/gone.png')).status).toBe(404)
      })

      it('streams a local mode file from the folder on disk', async () => {
         state.cms = { media: { storage: 'local', localRoot: dir } }
         state.indexFiles = [{ key: '2026/09/photo.png', mime: 'image/png' }]
         const res = await download('2026/09/photo.png')
         expect(res.status).toBe(200)
         expect(res.headers.get('content-disposition')).toContain('attachment')
         expect(await res.text()).toBe('original-bytes')
      })

      it('rejects a local mode key that is not in the index', async () => {
         state.cms = { media: { storage: 'local', localRoot: dir } }
         expect((await download('2026/09/photo.png')).status).toBe(404)
      })
   })

   describe('local mode without the folder on disk', () => {
      afterEach(() => vi.unstubAllGlobals())

      it('fetches the file from the public base url and streams it as an attachment', async () => {
         state.cms = { media: { storage: 'local', localRoot: '/nonexistent/path' } }
         state.publicCms = { mediaBaseUrl: 'https://cdn.example.com/images' }
         state.indexFiles = [{ key: 'hero image.jpg', mime: 'image/jpeg' }]
         const upstream = vi.fn(
            async (_url: URL) =>
               new Response('jpeg-bytes', { headers: { 'content-type': 'image/jpeg' } })
         )
         vi.stubGlobal('fetch', upstream)
         const res = await download('hero image.jpg')
         expect(String(upstream.mock.calls[0]![0])).toBe(
            'https://cdn.example.com/images/hero%20image.jpg'
         )
         expect(res.status).toBe(200)
         expect(res.headers.get('content-type')).toBe('image/jpeg')
         expect(res.headers.get('content-disposition')).toContain('attachment')
         expect(await res.text()).toBe('jpeg-bytes')
      })

      it('resolves a root-relative base url against the request origin', async () => {
         state.cms = { media: { storage: 'local', localRoot: '/nonexistent/path' } }
         state.publicCms = { mediaBaseUrl: '/images' }
         state.indexFiles = [{ key: 'a/b.pdf', mime: 'application/pdf' }]
         const upstream = vi.fn(async (_url: URL) => new Response('pdf'))
         vi.stubGlobal('fetch', upstream)
         await download('a/b.pdf')
         expect(String(upstream.mock.calls[0]![0])).toBe('http://localhost/images/a/b.pdf')
      })

      it('answers 502 when the source fails', async () => {
         state.cms = { media: { storage: 'local', localRoot: '/nonexistent/path' } }
         state.indexFiles = [{ key: 'a.pdf', mime: 'application/pdf' }]
         vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('no', { status: 500 }))
         )
         expect((await download('a.pdf')).status).toBe(502)
      })
   })
})
