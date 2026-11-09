import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const OCR_SCRIPT = path.resolve(here, '..', 'assets', 'wallpaper-ocr.ps1')

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows'
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/** Run PowerShell without piped stdio (works inside and outside the DSH sandbox). */
export async function runPowerShell(args, logPath) {
  const fd = await open(logPath, 'w')
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(powershellPath(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
        stdio: ['ignore', 'ignore', fd.fd],
        windowsHide: true
      })
      child.once('error', reject)
      child.once('close', (exitCode) => resolve(exitCode))
    })
    return code
  } finally {
    await fd.close().catch(() => {})
  }
}

/**
 * Run the Windows OCR helper over a screenshot.
 *
 * The helper finds the blue "subscribed" check badges (which also give the exact
 * tile grid), then OCRs the whole image at several scales. Doing everything in
 * one PowerShell run keeps the plugin dependency-free on Windows.
 *
 * @param {string} imagePath absolute path to the screenshot
 * @returns {Promise<{width:number,height:number,badges:Array,lines:Array,language:string}>}
 */
export async function analyzeScreenshot(imagePath) {
  if (process.platform !== 'win32') {
    throw new Error('wallpaper_cleanup_scan currently supports Windows only (Windows.Media.Ocr is required)')
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-wallpaper-ocr-'))
  const out = path.join(dir, 'ocr.json')
  const log = path.join(dir, 'ocr.log')
  try {
    const code = await runPowerShell(
      ['-STA', '-File', OCR_SCRIPT, '-ImagePath', imagePath, '-OutJson', out],
      log
    )
    const text = await readFile(out, 'utf8').catch(() => null)
    if (!text) {
      const detail = (await readFile(log, 'utf8').catch(() => '')).trim()
      throw new Error(`screenshot OCR failed (exit ${code})${detail ? `: ${detail.slice(-1500)}` : ''}`)
    }
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
