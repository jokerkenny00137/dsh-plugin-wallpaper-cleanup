import { defineTool } from '@deepseek-ai/dsh-tools'
import { buildPlan, executePlan } from './actions.js'
import { registerRoutes } from './routes.js'

export const name = 'dsh-plugin-wallpaper-cleanup'
export const inject = ['tools', 'webServer']

const MAX_LINES = 80

function bullets(items, format, limit = MAX_LINES) {
  const lines = items.slice(0, limit).map(format)
  if (items.length > limit) lines.push(`… 以及另外 ${items.length - limit} 项`)
  return lines
}

function renderScan(value) {
  if (!value.ok) return [{ type: 'text', text: `扫描失败：${value.error || '未知错误'}` }]
  const lines = []
  lines.push('壁纸清理扫描完成（未删除任何文件）。')
  lines.push(`文件夹：${value.folder}`)
  lines.push(`模式：${value.mode === 'ocr' ? '截图 OCR' : '显式标题列表'}`)
  if (value.mode === 'ocr') {
    const pages = value.screenshotCount > 1 ? `（合并 ${value.screenshotCount} 张截图）` : ''
    lines.push(`截图中检测到订阅徽章：${value.badgeCount} 个${pages}；匹配到文件夹：${value.matchedCount} 个`)
  } else {
    lines.push(`收到标题：${value.givenTitles} 个；匹配到文件夹：${value.matchedCount} 个`)
  }
  lines.push(`保留 ${value.keep.length} 个：`)
  lines.push(...bullets(value.keep, (k) => `  - [${k.id}] ${k.title}（相似度 ${Number(k.score).toFixed(2)}）`))
  lines.push(`计划移入回收站 ${value.remove.length} 个：`)
  lines.push(...bullets(value.remove, (r) => `  - [${r.id}] ${r.title}`))
  if (value.unresolved.length) {
    lines.push(`未能确认 ${value.unresolved.length} 项（需要补充标题或改用 titles 参数）：`)
    lines.push(
      ...value.unresolved.slice(0, 20).map((u) =>
        u.kind === 'tile'
          ? `  - ${
              typeof u.page === 'number' ? `第 ${u.page + 1} 张截图第 ${(u.tile ?? 0) + 1} 个磁贴` : `第 ${(u.tile ?? 0) + 1} 个磁贴`
            }：OCR 文本「${u.text || '空'}」，最佳相似度 ${Number(u.score || 0).toFixed(2)}`
          : `  - 标题「${u.text}」未匹配到文件夹`
      )
    )
  }
  for (const warning of value.warnings) lines.push(`警告：${warning}`)
  lines.push(`可安全执行：${value.safeToApply ? '是' : '否'}`)
  lines.push(`planId：${value.planId}`)
  lines.push(
    value.safeToApply
      ? '下一步：调用 wallpaper_cleanup_apply，planId 使用上面的值，并传 confirm=true。'
      : '建议：先补充/修正 titles 参数并重新扫描，确认无误后再执行。'
  )
  return [{ type: 'text', text: lines.join('\n') }]
}

function renderApply(value) {
  if (!value.ok) return [{ type: 'text', text: `执行失败：${value.error || value.message}` }]
  const lines = [
    `已把 ${value.recycledCount} 个壁纸文件夹移入回收站（可恢复）。`,
    `未改动保留的 ${value.verifiedKeep} 个订阅壁纸。`
  ]
  if (value.failedCount) {
    lines.push(`失败 ${value.failedCount} 个：`)
    lines.push(...value.failed.map((f) => `  - [${f.id}] ${f.error}`))
  }
  lines.push('如需真正释放磁盘空间，请在确认无误后手动清空回收站（或只清空这批项目）。')
  return [{ type: 'text', text: lines.join('\n') }]
}

const scanTool = defineTool({
  name: 'wallpaper_cleanup_scan',
  description:
    '扫描 Wallpaper Engine 工坊内容文件夹，并与“我的订阅壁纸”截图比对，列出哪些文件夹不是订阅的、计划移入回收站；本工具只生成计划，不删除任何文件。之后用 wallpaper_cleanup_apply 执行。适用于 Windows + Steam 工坊目录 431960。',
  parameters: {
    folder: {
      type: 'string',
      required: true,
      description: 'Steam 工坊内容文件夹的绝对路径，例如 C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960'
    },
    screenshot: {
      type: 'string',
      description: 'Wallpaper Engine“已订阅/已安装”列表截图的绝对路径（png/jpg）。截图里每个已订阅磁贴右上角有蓝色勾选徽章。'
    },
    screenshots: {
      type: 'array',
      description: '可选：多张订阅截图（同一列表的连续几页）。给出时会合并所有页的徽章与标题再统一匹配，避免分页导致误删。',
      items: { type: 'string' }
    },
    titles: {
      type: 'array',
      description: '可选：直接给出订阅壁纸的标题列表，通常是截图里能读到的标题，可截断。给出时优先使用标题匹配，不再依赖 OCR。',
      items: { type: 'string' }
    },
    threshold: {
      type: 'number',
      description: '标题相似度阈值 0-1。OCR 模式默认 0.3，标题列表模式最低 0.45。越高越保守，越低越容易把非订阅项误判为订阅。'
    }
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        error: { type: 'string' },
        planId: { type: 'string', required: true },
        folder: { type: 'string', required: true },
        mode: { type: 'string', required: true },
        screenshotCount: { type: 'integer', required: true },
        badgeCount: { type: 'integer', required: true },
        givenTitles: { type: 'integer', required: true },
        matchedCount: { type: 'integer', required: true },
        safeToApply: { type: 'boolean', required: true },
        keep: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true },
              score: { type: 'number', required: true }
            }
          }
        },
        remove: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              title: { type: 'string', required: true }
            }
          }
        },
        unresolved: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              kind: { type: 'string' },
              text: { type: 'string' },
              tile: { type: 'integer' },
              score: { type: 'number' }
            }
          }
        },
        warnings: { type: 'array', required: true, items: { type: 'string' } },
        ignoredCount: { type: 'integer', required: true }
      }
    },
    render: (_args, value) => renderScan(value)
  },
  async execute(args) {
    const titles = Array.isArray(args.titles) ? args.titles : []
    const screenshots = Array.isArray(args.screenshots)
      ? args.screenshots.map((item) => String(item || '')).filter(Boolean)
      : []
    try {
      const result = await buildPlan({
        folder: args.folder,
        screenshot: args.screenshot,
        screenshots,
        titles,
        threshold: typeof args.threshold === 'number' && args.threshold > 0 && args.threshold < 1 ? args.threshold : undefined
      })
      return {
        ok: true,
        error: '',
        planId: result.planId,
        folder: result.folder,
        mode: result.mode,
        screenshotCount: result.screenshotCount,
        badgeCount: result.badgeCount,
        givenTitles: titles.length,
        matchedCount: result.matchedCount,
        safeToApply: result.safeToApply,
        keep: result.keep,
        remove: result.remove,
        unresolved: result.unresolved,
        warnings: result.warnings,
        ignoredCount: result.ignored
      }
    } catch (error) {
      return {
        ok: false,
        error: error?.message || String(error),
        planId: '',
        folder: String(args.folder || ''),
        mode: titles.length ? 'titles' : 'ocr',
        screenshotCount: screenshots.length || (args.screenshot ? 1 : 0),
        badgeCount: 0,
        givenTitles: titles.length,
        matchedCount: 0,
        safeToApply: false,
        keep: [],
        remove: [],
        unresolved: [],
        warnings: [],
        ignoredCount: 0
      }
    }
  }
})

const applyTool = defineTool({
  name: 'wallpaper_cleanup_apply',
  description:
    '执行 wallpaper_cleanup_scan 生成的计划：把计划中“非订阅”的壁纸文件夹移入 Windows 回收站（可恢复），不改动保留项与文件夹里的其他文件。必须传 confirm=true；计划不安全时需显式 force=true。',
  parameters: {
    planId: { type: 'string', required: true, description: 'wallpaper_cleanup_scan 返回的 planId' },
    confirm: { type: 'boolean', required: true, description: '必须为 true，表示确认按计划移入回收站' },
    force: { type: 'boolean', description: '计划被标记为不安全（有未确认磁贴）时，仍要执行则传 true。慎用。' }
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        error: { type: 'string' },
        planId: { type: 'string', required: true },
        recycledCount: { type: 'integer', required: true },
        failedCount: { type: 'integer', required: true },
        verifiedKeep: { type: 'integer', required: true },
        failed: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string', required: true },
              error: { type: 'string', required: true }
            }
          }
        },
        message: { type: 'string', required: true }
      }
    },
    render: (_args, value) => renderApply(value)
  },
  async execute(args) {
    if (args.confirm !== true) throw new Error('confirm must be true; this operation moves folders to the Recycle Bin')
    const result = await executePlan({ planId: args.planId, force: args.force === true })
    return {
      ok: result.failedCount === 0,
      error: '',
      planId: result.planId,
      recycledCount: result.recycledCount,
      failedCount: result.failedCount,
      verifiedKeep: result.verifiedKeep,
      failed: result.failed.map((f) => ({ id: f.id, error: f.error })),
      message: result.message
    }
  }
})

export function apply(ctx) {
  ctx.tools.register(scanTool)
  ctx.tools.register(applyTool)
  const diagnostics = { clientGraph: () => null, clientPath: () => undefined }
  ctx.inject(['clientModules'], (clientCtx) => {
    diagnostics.clientGraph = () => {
      try {
        return clientCtx.clientModules.graph()
      } catch {
        return null
      }
    }
    diagnostics.clientPath = (id) => {
      try {
        return clientCtx.clientModules.clientPath(id)
      } catch {
        return undefined
      }
    }
  })
  ctx.effect(() => registerRoutes(ctx.webServer, diagnostics), 'wallpaper-cleanup: HTTP routes')
}

export default { name, inject, apply }
