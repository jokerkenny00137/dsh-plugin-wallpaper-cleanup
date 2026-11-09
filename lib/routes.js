import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildPlan, executePlan } from './actions.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const PICK_FOLDER_SCRIPT = path.resolve(here, '..', 'assets', 'pick-folder.ps1')

export const BASE = '/wallpaper-cleanup'
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

/** Same-origin guard: our page always sends the header; cross-site forms cannot. */
function guard(req, res) {
  if (req.headers['x-dsh-wc'] !== '1') {
    sendJson(res, 403, { ok: false, error: 'forbidden' })
    return false
  }
  return true
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function dataDir() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, 'wallpaper-cleanup')
}

function imageExt(contentType, originalName) {
  const byType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/bmp': '.bmp'
  }
  if (byType[contentType]) return byType[contentType]
  const ext = path.extname(String(originalName || '')).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext) ? ext : '.png'
}

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows'
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Show the native folder picker on the user's desktop. */
function pickFolder() {
  const out = path.join(dataDir(), `pick-${randomUUID()}.json`)
  return new Promise((resolve) => {
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      resolve(value)
    }
    const child = spawn(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', PICK_FOLDER_SCRIPT, '-OutJson', out],
      { stdio: 'ignore', windowsHide: true }
    )
    child.once('error', (error) => finish({ path: '', error: String(error?.message || error), canceled: false }))
    child.once('close', async () => {
      try {
        const text = await readFile(out, 'utf8')
        const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
        finish({
          path: typeof parsed.path === 'string' ? parsed.path : '',
          error: typeof parsed.error === 'string' ? parsed.error : '',
          canceled: Boolean(parsed.canceled)
        })
      } catch {
        finish({ path: '', error: '系统文件夹对话框未能打开', canceled: false })
      }
    })
  })
}

function steamRoots() {
  const roots = []
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
      encoding: 'utf8',
      windowsHide: true
    })
    const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (match) roots.push(match[1].trim())
  } catch {
    /* registry lookup is best effort */
  }
  roots.push(
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    'D:\\Steam',
    'D:\\SteamLibrary',
    'E:\\Steam',
    'E:\\SteamLibrary'
  )
  return [...new Set(roots)].map((root) => path.join(root, 'steamapps', 'workshop', 'content', '431960'))
}

/**
 * Register the browser-facing HTTP endpoints. They are same-origin JSON routes
 * used by the settings page; the tool API remains available to the agent.
 */
export function registerRoutes(webServer, diagnostics = {}) {
  const disposers = []

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/diagnose`,
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        let graph = null
        try {
          graph = diagnostics.clientGraph ? diagnostics.clientGraph() : null
        } catch {
          graph = null
        }
        const entries = Array.isArray(graph?.entries) ? graph.entries : []
        const mine = entries.filter((entry) => String(entry?.id || '').includes('wallpaper-cleanup'))
        sendJson(res, 200, {
          ok: true,
          release: graph?.release || null,
          entryCount: entries.length,
          mine: mine.map((entry) => ({ id: entry.id, url: entry.url })),
          clientPath: diagnostics.clientPath ? diagnostics.clientPath('dsh-plugin-wallpaper-cleanup') : undefined,
          keys: graph ? Object.keys(graph) : null
        })
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/browse`,
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        try {
          const requested = new URL(req.url || '/', 'http://localhost').searchParams.get('path') || ''
          if (!requested) {
            const drives = []
            for (let code = 65; code <= 90; code++) {
              const root = `${String.fromCharCode(code)}:\\`
              if (existsSync(root)) drives.push({ name: root, path: root })
            }
            return sendJson(res, 200, { ok: true, path: '', parent: '', entries: drives, drives: true })
          }
          const target = path.resolve(requested)
          const info = await stat(target).catch(() => null)
          if (!info || !info.isDirectory()) return sendJson(res, 400, { ok: false, error: '不是有效文件夹' })
          const dirents = await readdir(target, { withFileTypes: true }).catch(() => [])
          const entries = dirents
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
            .slice(0, 500)
          const parent = path.dirname(target)
          sendJson(res, 200, {
            ok: true,
            path: target,
            parent: parent === target ? '' : parent,
            entries
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message || error) })
        }
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/defaults`,
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        const found = steamRoots().find((candidate) => existsSync(candidate)) || ''
        sendJson(res, 200, { ok: true, folder: found })
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/pick-folder`,
      handler: async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        try {
          const result = await pickFolder()
          sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message || error) })
        }
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/upload`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        try {
          const body = await readBody(req, MAX_UPLOAD_BYTES)
          if (!body.length) return sendJson(res, 400, { ok: false, error: '空文件' })
          const dir = path.join(dataDir(), 'uploads')
          await mkdir(dir, { recursive: true })
          const ext = imageExt(String(req.headers['content-type'] || ''), req.headers['x-filename'])
          const target = path.join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`)
          await writeFile(target, body)
          sendJson(res, 200, {
            ok: true,
            path: target,
            name: String(req.headers['x-filename'] || path.basename(target)),
            size: body.length
          })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message || error) })
        }
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/scan`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        try {
          const raw = await readBody(req, 1024 * 1024)
          const body = JSON.parse(raw.toString('utf8') || '{}')
          const result = await buildPlan({
            folder: body.folder,
            screenshot: body.screenshot,
            screenshots: body.screenshots,
            titles: body.titles,
            threshold: typeof body.threshold === 'number' ? body.threshold : undefined
          })
          sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message || error) })
        }
      }
    })
  )

  disposers.push(
    webServer.register({
      kind: 'exact',
      path: `${BASE}/apply`,
      handler: async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        if (!guard(req, res)) return
        try {
          const raw = await readBody(req, 256 * 1024)
          const body = JSON.parse(raw.toString('utf8') || '{}')
          if (body.confirm !== true) return sendJson(res, 400, { ok: false, error: '需要确认后才能执行' })
          const result = await executePlan({ planId: body.planId, force: body.force === true })
          sendJson(res, 200, { ok: true, ...result })
        } catch (error) {
          sendJson(res, 400, { ok: false, error: String(error?.message || error) })
        }
      }
    })
  )

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already gone */
      }
    }
  }
}
