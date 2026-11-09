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

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

function collectScreenshots(screenshot, screenshots) {
  const list = Array.isArray(screenshots) ? screenshots : []
  const cleaned = list.map((item) => String(item || '')).filter(Boolean)
  if (cleaned.length) return cleaned
  return screenshot ? [String(screenshot)] : []
}

/**
 * Match one or more subscription screenshots / given titles against the folder
 * list and produce a plan. All pages are merged before matching, so a wallpaper
 * visible on any page counts as subscribed.
 */
export async function scan({ folder, screenshot, screenshots, titles, threshold }) {
  const folderStat = await stat(folder).catch(() => null)
  if (!folderStat || !folderStat.isDirectory()) throw new Error(`folder does not exist or is not a directory: ${folder}`)

  const shots = collectScreenshots(screenshot, screenshots)
  const validTitles = Array.isArray(titles) ? titles.map((t) => String(t)).filter((t) => normalize(t).length >= 2) : []
  if (!validTitles.length && !shots.length) throw new Error('either a screenshot path or an explicit titles list is required')

  for (let i = 0; i < shots.length; i++) {
    const shotStat = await stat(shots[i]).catch(() => null)
    if (!shotStat || !shotStat.isFile()) throw new Error(`第 ${i + 1} 张截图不存在或不是文件：${shots[i]}`)
  }

  const { wallpapers, ignored } = await listWallpapers(folder)
  if (!wallpapers.length) throw new Error(`no wallpaper folders with project.json found under ${folder}`)

  const warnings = []
  const keep = []
  const unresolved = []
  let badgeCount = 0
  let mode = 'ocr'
  const allTiles = []
  const pages = []
  let effectiveThreshold = typeof threshold === 'number' && threshold > 0 && threshold < 1 ? threshold : null

  if (validTitles.length) {
    mode = 'titles'
    const minScore = Math.max(TITLE_MIN_SCORE, effectiveThreshold || 0)
    effectiveThreshold = minScore
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
    effectiveThreshold = effectiveThreshold || OCR_MIN_SCORE

    const analysed = await mapLimit(shots, 2, async (shot, pageIndex) => {
      try {
        const image = await analyzeScreenshot(shot)
        return { pageIndex, shot, image }
      } catch (error) {
        throw new Error(`第 ${pageIndex + 1} 张截图识别失败：${error?.message || error}`)
      }
    })

    const index = buildTitleIndex(wallpapers)
    const candidates = []

    for (const page of analysed) {
      const image = page.image
      const pageBadges = image.badges.length
      if (!pageBadges) {
        throw new Error(
          `第 ${page.pageIndex + 1} 张截图没有检测到订阅勾选徽章；请确认它是 Wallpaper Engine 的订阅列表，或改用 titles 手动填写标题`
        )
      }
      badgeCount += pageBadges
      const tiles = buildTiles(image)
      const tileTexts = groupTileText(tiles, image.lines || [])
      pages.push({ index: page.pageIndex, width: image.width, height: image.height, badgeCount: pageBadges, tileCount: tiles.length })
      tiles.forEach((tile) => {
        const text = tileTexts[tile.index]
        allTiles.push({ page: page.pageIndex, tile: tile.index, left: tile.left, top: tile.top, width: tile.right - tile.left, height: tile.bottom - tile.top, text: text || '' })
        if (!text) return
        for (const hit of rankFolders(text, index, effectiveThreshold)) {
          candidates.push({ page: page.pageIndex, tile: tile.index, folder: hit.index, score: hit.score })
        }
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    const assignedTiles = new Map()
    const usedFolders = new Set()
    for (const candidate of candidates) {
      const key = `${candidate.page}:${candidate.tile}`
      if (assignedTiles.has(key) || usedFolders.has(candidate.folder)) continue
      assignedTiles.set(key, candidate)
      usedFolders.add(candidate.folder)
    }

    for (const entry of allTiles) {
      const key = `${entry.page}:${entry.tile}`
      const hit = assignedTiles.get(key)
      if (hit) {
        keep.push({ index: hit.folder, tileIndex: allTiles.indexOf(entry), score: hit.score })
      } else {
        unresolved.push({
          kind: 'tile',
          page: entry.page,
          tile: entry.tile,
          text: entry.text,
          score: candidates
            .filter((c) => c.page === entry.page && c.tile === entry.tile)
            .reduce((m, c) => Math.max(m, c.score), 0)
        })
      }
    }
  }

  const keepIds = new Set(keep.map((k) => wallpapers[k.index].id))
  const remove = wallpapers.filter((w) => !keepIds.has(w.id)).map((w) => ({ id: w.id, title: w.title, path: w.dir }))

  const expectedCount = mode === 'titles' ? validTitles.length : badgeCount
  const safeToApply = keep.length > 0 && unresolved.length === 0 && keep.length === expectedCount

  if (keep.length < expectedCount) warnings.push(`${expectedCount - keep.length} subscribed item(s) could not be matched to a folder`)
  if (mode === 'ocr' && shots.length === 1 && remove.length) {
    warnings.push('只提供了 1 张截图：如果订阅列表还有下一页，请补选后再扫描，否则下一页的壁纸会被误判为未订阅。')
  }
  if (mode === 'ocr') {
    const totalTiles = allTiles.length
    if (totalTiles !== badgeCount) warnings.push(`badge count ${badgeCount} does not match tile count ${totalTiles}`)
    if (shots.length > 1) warnings.push(`已合并 ${shots.length} 张截图的订阅列表（共 ${badgeCount} 个磁贴）`)
  }

  return {
    folder,
    screenshot: shots[0] || '',
    screenshots: shots,
    mode,
    imageSize: pages[0] ? { width: pages[0].width, height: pages[0].height } : null,
    pages,
    badgeCount,
    matchedCount: keep.length,
    keep: summarizeKeep(keep, wallpapers),
    remove,
    unresolved,
    warnings,
    safeToApply,
    ignored,
    tiles: allTiles,
    threshold: effectiveThreshold
  }
}

export { OCR_MIN_SCORE, TITLE_MIN_SCORE }
