import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPowerShell } from './ocr.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const RECYCLE_SCRIPT = path.resolve(here, '..', 'assets', 'recycle.ps1')

/**
 * Move directories to the Windows Recycle Bin (recoverable), one result per path.
 * @param {string[]} folders absolute directory paths
 * @returns {Promise<Array<{path:string, ok:boolean, error:string}>>}
 */
export async function recycleFolders(folders) {
  if (process.platform !== 'win32') throw new Error('recycling folders is supported on Windows only')
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-wallpaper-recycle-'))
  const list = path.join(dir, 'list.json')
  const out = path.join(dir, 'result.json')
  const log = path.join(dir, 'recycle.log')
  try {
    await writeFile(list, JSON.stringify(folders), 'utf8')
    const code = await runPowerShell(
      ['-STA', '-File', RECYCLE_SCRIPT, '-ListJson', list, '-OutJson', out],
      log
    )
    const text = await readFile(out, 'utf8').catch(() => null)
    if (!text) {
      const detail = (await readFile(log, 'utf8').catch(() => '')).trim()
      throw new Error(`recycle helper failed (exit ${code})${detail ? `: ${detail.slice(-1500)}` : ''}`)
    }
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ''))
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return folders.map((folder, index) => {
      const hit = rows[index] || rows.find((r) => path.resolve(r.path).toLowerCase() === path.resolve(folder).toLowerCase())
      return { path: folder, ok: Boolean(hit?.ok), error: hit?.error || (hit ? '' : 'no result') }
    })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

