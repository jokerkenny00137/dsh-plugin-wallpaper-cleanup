import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { normalize, similarity, buildTitleIndex, rankFolders } from './text.js'
import { analyzeScreenshot } from './ocr.js'

const OCR_MIN_SCORE = 0.3
const TITLE_MIN_SCORE = 0.45

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function decodeProjectJson(buffer) {
  let text = buffer.toString('utf8')
  if (text.includes('\uFFFD')) {
    try {
      text = new TextDecoder('gbk').decode(buffer)
    } catch {
      /* keep utf8 */
    }
  }
  return JSON.parse(text.replace(/^\uFEFF/, ''))
}

async function readWallpaper(dir) {
  const projectPath = path.join(dir, 'project.json')
  try {
    const raw = await readFile(projectPath)
    const json = decodeProjectJson(raw)
    const title = typeof json.title === 'string' ? json.title.trim() : ''
    if (!title) return null
    return {
      id: path.basename(dir),
      dir,
      title,
      type: typeof json.type === 'string' ? json.type : '',
      preview: typeof json.preview === 'string' ? path.join(dir, json.preview) : ''
    }
  } catch {
    return null
  }
}

/** Enumerate direct child workshop folders that look like installed wallpapers. */
export async function listWallpapers(folder) {
  const entries = await readdir(folder, { withFileTypes: true })
  const wallpapers = []
  const ignored = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      ignored.push({ name: entry.name, reason: 'not a directory' })
      continue
    }
    if (!/^\d+$/.test(entry.name)) {
      ignored.push({ name: entry.name, reason: 'not a numeric workshop id' })
      continue
    }
    const dir = path.join(folder, entry.name)
    const info = await readWallpaper(dir)
    if (!info) {
      ignored.push({ name: entry.name, reason: 'no readable project.json title' })
      continue
    }
    wallpapers.push(info)
  }
  return { wallpapers, ignored }
}

/** Build tile rectangles from the subscription badges. */
export function buildTiles(image) {
  const badges = Array.isArray(image?.badges) ? image.badges : []
  if (!badges.length) return []
  const xs = [...new Set(badges.map((b) => b.x))].sort((a, b) => a - b)
  const ys = [...new Set(badges.map((b) => b.y))].sort((a, b) => a - b)
  const gapsX = xs.slice(1).map((x, i) => x - xs[i])
  const gapsY = ys.slice(1).map((y, i) => y - ys[i])
  const tileW = median(gapsX) || 166
  const tileH = median(gapsY) || 166
  return badges
    .map((b) => {
      const right = b.x + b.w + 1
      const top = Math.max(0, b.y - 26)
      return { left: Math.max(0, right - tileW), right, top, bottom: top + tileH, badge: b }
    })
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((tile, index) => ({ ...tile, index }))
}

function overlap(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

/**
 * Attach OCR lines to tiles by horizontal overlap. A merged line may straddle
 * two tiles (OCR joins neighbours), so each line may feed its two best tiles;
 * the later unique-assignment step sorts out the duplicates.
 */
export function groupTileText(tiles, lines) {
  const buckets = tiles.map(() => [])
  for (const line of lines) {
    const w = Math.max(1, line.w || 1)
    if (normalize(line.text).length < 2) continue
    const yTop = line.y
    const yBottom = line.y + Math.max(1, line.h || 1)
    const hits = []
    for (const tile of tiles) {
      const hOverlap = overlap(tile.left, tile.right, line.x, line.x + w)
      if (hOverlap < 0.25 * w) continue
      const vOverlap = overlap(tile.top + (tile.bottom - tile.top) * 0.45, tile.bottom + 12, yTop, yBottom)
      if (vOverlap <= 0) continue
      hits.push({ tile, hOverlap })
    }
    hits.sort((a, b) => b.hOverlap - a.hOverlap)
    for (const hit of hits.slice(0, 2)) buckets[hit.tile.index].push(line)
  }
  return buckets.map((bucket) => {
    const seen = new Set()
    return bucket
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((l) => l.text)
      .filter((text) => {
        const key = normalize(text)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .join(' ')
  })
}

function summarizeKeep(list, folders) {
  return list
    .map((hit) => ({
      id: folders[hit.index].id,
      title: folders[hit.index].title,
      score: Math.round(hit.score * 1000) / 1000,
      tileIndex: hit.tileIndex
    }))
    .sort((a, b) => a.tileIndex - b.tileIndex)
}

/**
 * Match the screenshot / given titles against the folder list and produce a plan.
 */
export async function scan({ folder, screenshot, titles, threshold }) {
  const folderStat = await stat(folder).catch(() => null)
  if (!folderStat || !folderStat.isDirectory()) throw new Error(`folder does not exist or is not a directory: ${folder}`)

  if (screenshot) {
    const shotStat = await stat(screenshot).catch(() => null)
    if (!shotStat || !shotStat.isFile()) throw new Error(`screenshot does not exist or is not a file: ${screenshot}`)
  }

  const { wallpapers, ignored } = await listWallpapers(folder)
  if (!wallpapers.length) throw new Error(`no wallpaper folders with project.json found under ${folder}`)

  const warnings = []
  const keep = []
  const unresolved = []
  let badgeCount = 0
  let mode = 'ocr'
  let tiles = []
  let tileTexts = []
  let imageSize = null
  let effectiveThreshold = typeof threshold === 'number' && threshold > 0 && threshold < 1 ? threshold : null

  if (Array.isArray(titles) && titles.some((t) => typeof t === 'string' && t.trim())) {
    mode = 'titles'
    const minScore = Math.max(TITLE_MIN_SCORE, effectiveThreshold || 0)
    effectiveThreshold = minScore
    const validTitles = titles.map((t) => String(t)).filter((t) => normalize(t).length >= 2)
    const used = new Set()
    for (const title of validTitles) {
      let best = null
      for (let i = 0; i < wallpapers.length; i++) {
        if (used.has(wallpapers[i].id)) continue
        const s = similarity(title, wallpapers[i].title)
        if (!best || s > best.score) best = { index: i, score: s }
      }
      if (best && best.score >= minScore) {
        used.add(wallpapers[best.index].id)
        keep.push({ index: best.index, tileIndex: -1, score: best.score })
      } else {
        unresolved.push({ kind: 'title', text: title, score: best ? best.score : 0 })
      }
    }
  } else {
    if (!screenshot) throw new Error('either a screenshot path or an explicit titles list is required')
    effectiveThreshold = effectiveThreshold || OCR_MIN_SCORE
    const image = await analyzeScreenshot(screenshot)
    imageSize = { width: image.width, height: image.height }
    badgeCount = image.badges.length
    if (!badgeCount) {
      throw new Error('no subscription check badges were detected in the screenshot; pass `titles` explicitly if the screenshot uses a different theme')
    }
    tiles = buildTiles(image)
    tileTexts = groupTileText(tiles, image.lines || [])

    const index = buildTitleIndex(wallpapers)
    const candidates = []
    for (const tile of tiles) {
      const text = tileTexts[tile.index]
      if (!text) continue
      for (const hit of rankFolders(text, index, effectiveThreshold)) {
        candidates.push({ tile: tile.index, folder: hit.index, score: hit.score })
      }
    }
    candidates.sort((a, b) => b.score - a.score)
    const assignedTiles = new Map()
    const usedFolders = new Set()
    for (const candidate of candidates) {
      if (assignedTiles.has(candidate.tile) || usedFolders.has(candidate.folder)) continue
      assignedTiles.set(candidate.tile, candidate)
      usedFolders.add(candidate.folder)
    }
    for (const tile of tiles) {
      const hit = assignedTiles.get(tile.index)
      if (hit) {
        keep.push({ index: hit.folder, tileIndex: tile.index, score: hit.score })
      } else {
        unresolved.push({
          kind: 'tile',
          tile: tile.index,
          text: tileTexts[tile.index] || '',
          score: candidates.filter((c) => c.tile === tile.index).reduce((m, c) => Math.max(m, c.score), 0)
        })
      }
    }
  }

  const keepIds = new Set(keep.map((k) => wallpapers[k.index].id))
  const remove = wallpapers.filter((w) => !keepIds.has(w.id)).map((w) => ({ id: w.id, title: w.title, path: w.dir }))

  const expectedCount = mode === 'titles'
    ? titles.map((t) => String(t)).filter((t) => normalize(t).length >= 2).length
    : badgeCount
  const safeToApply = keep.length > 0 && unresolved.length === 0 && keep.length === expectedCount

  if (keep.length < expectedCount) warnings.push(`${expectedCount - keep.length} subscribed item(s) could not be matched to a folder`)
  if (mode === 'ocr' && tiles.length !== badgeCount) warnings.push(`badge count ${badgeCount} does not match tile count ${tiles.length}`)

  return {
    folder,
    screenshot: screenshot || '',
    mode,
    imageSize,
    badgeCount,
    matchedCount: keep.length,
    keep: summarizeKeep(keep, wallpapers),
    remove,
    unresolved,
    warnings,
    safeToApply,
    ignored,
    tiles: tiles.map((t) => ({
      index: t.index,
      left: t.left,
      top: t.top,
      width: t.right - t.left,
      height: t.bottom - t.top,
      text: tileTexts[t.index] || ''
    })),
    threshold: effectiveThreshold
  }
}

export { OCR_MIN_SCORE, TITLE_MIN_SCORE }

