import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
const planDir = path.join(home, 'wallpaper-cleanup', 'plans')
const memory = new Map()

async function ensureDir() {
  await mkdir(planDir, { recursive: true })
}

export async function savePlan(plan) {
  memory.set(plan.planId, plan)
  try {
    await ensureDir()
    await writeFile(path.join(planDir, `${plan.planId}.json`), JSON.stringify(plan, null, 2), 'utf8')
  } catch {
    // Memory-only plans still work for the current session.
  }
}

export async function loadPlan(planId) {
  if (memory.has(planId)) return memory.get(planId)
  try {
    const text = await readFile(path.join(planDir, `${planId}.json`), 'utf8')
    const plan = JSON.parse(text)
    memory.set(planId, plan)
    return plan
  } catch {
    return null
  }
}

export async function dropPlan(planId) {
  memory.delete(planId)
  try {
    await unlink(path.join(planDir, `${planId}.json`))
  } catch {
    /* already gone */
  }
}

export async function prunePlans(maxAgeDays = 14) {
  try {
    const files = await readdir(planDir)
    const cutoff = Date.now() - maxAgeDays * 86_400_000
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const full = path.join(planDir, file)
      const { stat } = await import('node:fs/promises')
      const info = await stat(full).catch(() => null)
      if (info && info.mtimeMs < cutoff) await unlink(full).catch(() => {})
    }
  } catch {
    /* nothing to prune */
  }
}
