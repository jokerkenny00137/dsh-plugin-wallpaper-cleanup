/**
 * Text normalisation and fuzzy title matching for workshop wallpapers.
 *
 * OCR output from a Wallpaper Engine screenshot is noisy: titles are truncated
 * with "…", glyphs are misread (咲 → 味), CJK characters arrive separated by
 * spaces, and neighbouring tiles bleed into each other. Two scorers are used:
 *
 *  - `buildTitleIndex` + `coverage` — IDF-weighted character-bigram recall. Rare
 *    bigrams ("通缉", "刻晴") decide a match, while bigrams shared by many titles
 *    ("明日方舟", "Wuthering Waves") barely count. Extra OCR noise does not
 *    penalise the score, so tile bleed and wrap-around lines are tolerated.
 *  - `similarity` — LCS Dice against title prefixes, used when the caller passes
 *    an explicit title list.
 */

/** Keep only characters that carry meaning for a title; drop spacing/punctuation. */
export function normalize(text) {
  if (typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .replace(/[^0-9a-z\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g, '')
}

/** Unique character bigrams; a 1-character string yields itself. */
export function bigrams(text) {
  const s = normalize(text)
  if (!s) return []
  if (s.length === 1) return [s]
  const out = new Set()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  return [...out]
}

/** Length of the longest common subsequence of two strings. */
export function lcsLength(a, b) {
  if (!a.length || !b.length) return 0
  if (a.length > b.length) [a, b] = [b, a]
  const prev = new Uint16Array(a.length + 1)
  const cur = new Uint16Array(a.length + 1)
  for (let j = 1; j <= b.length; j++) {
    const bj = b.charCodeAt(j - 1)
    for (let i = 1; i <= a.length; i++) {
      if (a.charCodeAt(i - 1) === bj) cur[i] = prev[i - 1] + 1
      else cur[i] = cur[i - 1] > prev[i] ? cur[i - 1] : prev[i]
    }
    prev.set(cur)
  }
  return prev[a.length]
}

function dice(a, b) {
  if (!a.length || !b.length) return 0
  return (2 * lcsLength(a, b)) / (a.length + b.length)
}

/**
 * Similarity between a caller-supplied title and a folder title, in [0, 1].
 * The screenshot truncates long titles with an ellipsis, so the input is matched
 * against several prefixes of the folder title as well as the whole title.
 */
export function similarity(block, title) {
  const b = normalize(block)
  const t = normalize(title)
  if (!b || !t) return 0
  if (b === t) return 1
  let best = dice(b, t)
  const lo = Math.max(2, Math.floor(b.length * 0.55))
  const hi = Math.min(t.length, Math.max(lo, Math.ceil(b.length * 1.9)))
  const step = hi - lo > 24 ? 2 : 1
  for (let len = lo; len <= hi; len += step) {
    const s = dice(b, t.slice(0, len))
    if (s > best) best = s
  }
  if (t.length > b.length) {
    const s = dice(b, t.slice(t.length - b.length))
    if (s > best) best = s
  }
  return best
}

/**
 * Build an IDF-weighted bigram index over the folder titles.
 * @param {Array<{title:string}>} folders
 */
export function buildTitleIndex(folders) {
  const grams = folders.map((f) => bigrams(f.title))
  const df = new Map()
  for (const list of grams) for (const g of list) df.set(g, (df.get(g) || 0) + 1)
  const n = folders.length
  const idf = (g) => Math.log((n + 1) / ((df.get(g) || 0) + 0.5))
  return {
    grams,
    /** IDF-weighted recall of one title's bigrams in an OCR block. */
    coverage(block, folderIndex) {
      const blockGrams = new Set(bigrams(block))
      const titleGrams = grams[folderIndex] || []
      let total = 0
      let hit = 0
      for (const g of titleGrams) {
        const w = idf(g)
        total += w
        if (blockGrams.has(g)) hit += w
      }
      return total > 0 ? hit / total : 0
    },
    gramCount: grams.length
  }
}

/** Score every folder for one block, sorted best first. */
export function rankFolders(block, index, minScore) {
  const ranked = []
  for (let i = 0; i < index.gramCount; i++) {
    const score = index.coverage(block, i)
    if (score >= minScore) ranked.push({ index: i, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}
