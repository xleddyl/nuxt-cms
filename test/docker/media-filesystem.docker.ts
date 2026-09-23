import { execFileSync } from 'node:child_process'
import { chmod, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const IMAGE = 'nuxt-cms-media-filesystem-test'
const ADMIN_EMAIL = 'admin@example.com'
const ADMIN_PASSWORD = 'docker-test-password'
const MAX_FILE_SIZE = 64 * 1024

const PNG = Buffer.from(
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
   'base64'
)

let container = ''
let dataDir = ''
let baseUrl = ''
let cookie = ''

function docker(...args: string[]) {
   return execFileSync('docker', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

async function waitForServer() {
   const deadline = Date.now() + 60_000
   while (Date.now() < deadline) {
      try {
         const res = await fetch(`${baseUrl}/api/cms/graphql`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: '{ __typename }' }),
         })
         if (res.status < 500) return
      } catch {}
      await new Promise((done) => setTimeout(done, 500))
   }
   throw new Error(`The container did not start:\n${docker('logs', container)}`)
}

async function startContainer() {
   container = docker(
      'run',
      '-d',
      '-p',
      '127.0.0.1::3000',
      '-v',
      `${dataDir}:/data`,
      '-e',
      `NUXT_CMS_ADMIN_EMAIL=${ADMIN_EMAIL}`,
      '-e',
      `NUXT_CMS_ADMIN_PASSWORD=${ADMIN_PASSWORD}`,
      '-e',
      'NUXT_SESSION_PASSWORD=docker-test-session-password-0123456789',
      '-e',
      `NUXT_CMS_MEDIA_MAX_FILE_SIZE=${MAX_FILE_SIZE}`,
      IMAGE
   )
   baseUrl = `http://${docker('port', container, '3000/tcp').split('\n')[0]}`
   await waitForServer()
}

function request(path: string, init: RequestInit & { auth?: boolean } = {}) {
   const { auth = true, headers, ...rest } = init
   return fetch(`${baseUrl}${path}`, {
      ...rest,
      headers: {
         origin: baseUrl,
         ...(auth && cookie ? { cookie } : {}),
         ...(headers as Record<string, string>),
      },
   })
}

function json(path: string, method: string, body: unknown) {
   return request(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
   })
}

async function presign(filename: string, contentType: string, size: number, folder?: string) {
   return json('/api/cms/admin/media/presign', 'POST', { filename, contentType, size, folder })
}

async function upload(filename: string, body: Buffer<ArrayBuffer>, folder?: string) {
   const res = await presign(filename, 'image/png', body.length, folder)
   expect(res.status).toBe(200)
   const target = (await res.json()) as {
      key: string
      folder: string | null
      uploadUrl: string
      headers: Record<string, string>
   }
   const put = await request(target.uploadUrl, {
      method: 'PUT',
      headers: target.headers,
      body,
   })
   expect(put.status).toBe(201)
   const created = await json('/api/cms/admin/media', 'POST', {
      key: target.key,
      folder: target.folder,
      mime: 'image/png',
      size: body.length,
      width: 1,
      height: 1,
   })
   expect(created.status).toBe(200)
   return { target, item: (await created.json()) as { key: string; url: string } }
}

beforeAll(async () => {
   docker('build', '-t', IMAGE, '-f', 'test/docker/Dockerfile', '.')
   dataDir = await mkdtemp(join(tmpdir(), 'nuxt-cms-docker-'))
   await chmod(dataDir, 0o777)
   await startContainer()

   const login = await request('/api/cms/auth/login', {
      method: 'POST',
      auth: false,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
   })
   expect(login.status).toBe(200)
   cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
   expect(cookie).not.toBe('')
})

afterAll(async () => {
   if (container) docker('rm', '-f', container)
   if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

describe('filesystem media storage in Docker', () => {
   it('creates the database on the mounted volume', () => {
      expect(existsSync(join(dataDir, 'cms.db'))).toBe(true)
   })

   it('uploads a file to the volume and serves it', async () => {
      const { target, item } = await upload('Hero Image.png', PNG, 'Gallery')

      expect(target.uploadUrl).toBe(
         `/api/cms/admin/media/upload?key=${encodeURIComponent(target.key)}`
      )
      expect(target.key).toMatch(/^gallery\/[0-9a-f-]{36}-hero-image\.png$/)
      expect(item.url).toBe(`/media/${target.key}`)
      expect(await readFile(join(dataDir, 'media', target.key))).toEqual(PNG)

      const served = await request(item.url, { auth: false })
      expect(served.status).toBe(200)
      expect(served.headers.get('content-type')).toBe('image/png')
      expect(served.headers.get('cache-control')).toContain('immutable')
      expect(served.headers.get('x-content-type-options')).toBe('nosniff')
      expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG)

      const again = await request(target.uploadUrl, {
         method: 'PUT',
         headers: target.headers,
         body: PNG,
      })
      expect(again.status).toBe(409)
   })

   it('answers HEAD, range and conditional requests', async () => {
      const { item } = await upload('range.png', PNG)

      const head = await request(item.url, { method: 'HEAD', auth: false })
      expect(head.status).toBe(200)
      expect(head.headers.get('content-length')).toBe(String(PNG.length))

      const partial = await request(item.url, { auth: false, headers: { range: 'bytes=0-7' } })
      expect(partial.status).toBe(206)
      expect(partial.headers.get('content-range')).toBe(`bytes 0-7/${PNG.length}`)
      expect(Buffer.from(await partial.arrayBuffer())).toEqual(PNG.subarray(0, 8))

      const outside = await request(item.url, {
         auth: false,
         headers: { range: `bytes=${PNG.length}-` },
      })
      expect(outside.status).toBe(416)

      const etag = head.headers.get('etag')!
      const cached = await request(item.url, { auth: false, headers: { 'if-none-match': etag } })
      expect(cached.status).toBe(304)
   })

   it('rejects uploads without a session or from another origin', async () => {
      const path = `/api/cms/admin/media/upload?key=${encodeURIComponent('x/anon.png')}`
      const anonymous = await request(path, {
         method: 'PUT',
         auth: false,
         headers: { 'content-type': 'image/png' },
         body: PNG,
      })
      expect(anonymous.status).toBe(401)

      const crossOrigin = await request(path, {
         method: 'PUT',
         headers: { 'content-type': 'image/png', origin: 'https://evil.example' },
         body: PNG,
      })
      expect(crossOrigin.status).toBe(403)
      expect(existsSync(join(dataDir, 'media', 'x'))).toBe(false)
   })

   it('rejects files over the size limit and unsafe types', async () => {
      expect((await presign('big.png', 'image/png', MAX_FILE_SIZE + 1)).status).toBe(413)
      expect((await presign('icon.svg', 'image/svg+xml', 10)).status).toBe(415)

      const key = 'limits/big.png'
      const tooBig = await request(`/api/cms/admin/media/upload?key=${encodeURIComponent(key)}`, {
         method: 'PUT',
         headers: { 'content-type': 'image/png' },
         body: Buffer.alloc(MAX_FILE_SIZE + 1),
      })
      expect(tooBig.status).toBe(413)
      expect(existsSync(join(dataDir, 'media', key))).toBe(false)

      const svg = await request(`/api/cms/admin/media/upload?key=${encodeURIComponent('x.svg')}`, {
         method: 'PUT',
         headers: { 'content-type': 'image/svg+xml' },
         body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      })
      expect(svg.status).toBe(415)
   })

   it('refuses to register a key that was never uploaded', async () => {
      const res = await json('/api/cms/admin/media', 'POST', {
         key: 'missing/file.png',
         mime: 'image/png',
      })
      expect(res.status).toBe(400)
   })

   it('never serves files outside the media folder', async () => {
      for (const path of [
         '/media/%2e%2e%2fcms.db',
         '/media/..%2Fcms.db',
         '/media/%2Fetc%2Fpasswd',
      ]) {
         const res = await request(path, { auth: false })
         expect(res.status, path).toBe(404)
      }
   })

   it('keeps files and records after a container restart', async () => {
      const { item } = await upload('persistent.png', PNG, 'persist')

      docker('rm', '-f', container)
      await startContainer()

      const served = await request(item.url, { auth: false })
      expect(served.status).toBe(200)
      expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG)

      const list = await request('/api/cms/admin/media')
      expect(list.status).toBe(200)
      const { items } = (await list.json()) as { items: { key: string }[] }
      expect(items.map((entry) => entry.key)).toContain(item.key)
   })

   it('deletes a file from the volume', async () => {
      const { item } = await upload('delete-me.png', PNG, 'trash')

      const res = await request(`/api/cms/admin/media?key=${encodeURIComponent(item.key)}`, {
         method: 'DELETE',
      })
      expect(res.status).toBe(200)
      expect(existsSync(join(dataDir, 'media', item.key))).toBe(false)
      expect(existsSync(join(dataDir, 'media', 'trash'))).toBe(false)
      expect((await request(item.url, { auth: false })).status).toBe(404)
   })

   it('creates and deletes a folder on the volume', async () => {
      const created = await json('/api/cms/admin/media/folders', 'POST', { name: 'Empty Folder' })
      expect(created.status).toBe(200)
      expect(await readdir(join(dataDir, 'media', 'empty-folder'))).toEqual(['.keep'])
      expect((await request('/media/empty-folder/.keep', { auth: false })).status).toBe(404)

      await upload('inside.png', PNG, 'empty-folder')
      const refused = await request('/api/cms/admin/media/folders?name=empty-folder', {
         method: 'DELETE',
      })
      expect(refused.status).toBe(409)

      const deleted = await request(
         '/api/cms/admin/media/folders?name=empty-folder&recursive=true',
         {
            method: 'DELETE',
         }
      )
      expect(deleted.status).toBe(200)
      expect(existsSync(join(dataDir, 'media', 'empty-folder'))).toBe(false)
   })
})
