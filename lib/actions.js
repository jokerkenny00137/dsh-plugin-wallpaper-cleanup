import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { scan } from './scan.js'
import { savePlan, loadPlan, dropPlan } from './plans.js'
import { recycleFolders } from './recycle.js'

/** Build a scan plan and persist it; shared by the tool and the web UI. */
export async function buildPlan({ folder, screenshot, screenshots, titles, threshold }) {
  const resolvedFolder = path.resolve(String(folder || ''))
  const shotList = Array.isArray(screenshots)
    ? screenshots.map((item) => String(item || '')).filter(Boolean).map((item) => path.resolve(item))
    : screenshot
      ? [path.resolve(String(screenshot))]
      : []
  const cleanTitles = Array.isArray(titles) ? titles.map((t) => String(t)).filter((t) => t.trim()) : []

  const result = await scan({
    folder: resolvedFolder,
    screenshot: shotList[0] || '',
    screenshots: shotList,
    titles: cleanTitles,
    threshold
  })
  const planId = randomUUID().replace(/-/g, '').slice(0, 12)
  const plan = {
    planId,
    createdAt: new Date().toISOString(),
    folder: resolvedFolder,
    screenshot: shotList[0] || '',
    screenshots: shotList,
    mode: result.mode,
    safeToApply: result.safeToApply,
    keep: result.keep.map((k) => ({ id: k.id, title: k.title })),
    remove: result.remove.map((r) => ({ id: r.id, title: r.title, path: r.path })),
    unresolved: result.unresolved,
    badgeCount: result.badgeCount
  }
  await savePlan(plan)
  return {
    planId,
    folder: resolvedFolder,
    screenshots: shotList,
    screenshotCount: shotList.length,
    pages: result.pages,
    mode: result.mode,
    badgeCount: result.badgeCount,
    matchedCount: result.matchedCount,
    safeToApply: result.safeToApply,
    keep: result.keep.map((k) => ({ id: k.id, title: k.title, score: k.score })),
    remove: result.remove.map((r) => ({ id: r.id, title: r.title })),
    unresolved: result.unresolved,
    warnings: result.warnings,
    ignored: result.ignored.length
  }
}

function isDirectChild(folder, candidate) {
  const rel = path.relative(folder, candidate)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep)
}

/**
 * Move a plan's non-subscribed folders to the Recycle Bin.
 * Re-validates the folder before touching anything.
 */
export async function executePlan({ planId, force }) {
  const plan = await loadPlan(String(planId || ''))
  if (!plan) throw new Error(`plan 不存在或已执行：${planId}`)
  if (!plan.safeToApply && force !== true) {
    throw new Error('该计划未通过安全校验（有未确认的磁贴），请补充标题重新扫描，或确认后手动强制执行')
  }

  const folderStat = await stat(plan.folder).catch(() => null)
  if (!folderStat || !folderStat.isDirectory()) throw new Error(`文件夹已不存在：${plan.folder}`)

  const entries = await readdir(plan.folder, { withFileTypes: true })
  const present = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))
  for (const kept of plan.keep) {
    if (!present.has(kept.id)) throw new Error(`保留项 ${kept.id} 已不在文件夹里，已中止（未删除任何文件）`)
  }

  const targets = []
  for (const item of plan.remove) {
    const full = path.join(plan.folder, item.id)
    if (!isDirectChild(plan.folder, full) || !present.has(item.id)) continue
    targets.push({ id: item.id, path: full, title: item.title })
  }
  if (!targets.length) {
    return { planId: plan.planId, recycledCount: 0, failedCount: 0, verifiedKeep: plan.keep.length, failed: [], message: '没有需要移动的文件夹' }
  }

  const results = await recycleFolders(targets.map((t) => t.path))
  const failed = []
  let recycled = 0
  results.forEach((r, i) => {
    if (r.ok) recycled++
    else failed.push({ id: targets[i].id, title: targets[i].title, error: r.error || 'unknown error' })
  })
  await dropPlan(plan.planId)
  return {
    planId: plan.planId,
    recycledCount: recycled,
    failedCount: failed.length,
    verifiedKeep: plan.keep.length,
    failed,
    message: failed.length ? '部分文件夹无法移入回收站' : '完成'
  }
}
