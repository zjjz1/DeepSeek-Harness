/**
 * Local knowledge base plugin: keyword search over configured document
 * directories. The user maintains the directory list in settings (设置-知识库,
 * mirrored by the ui-knowledge-base row); the agent queries it with kb_search
 * and kb_list. Pure filesystem reads — no indexing, no persistence beyond the
 * settings namespace, no model-visible state beyond tool results.
 *
 * @module @deepseek-ai/dsh-knowledge-base
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  KB_SETTINGS_NAMESPACE, KnowledgeBaseSettingsSchema,
  type KbFile, type KbMatch, type KnowledgeBaseSettings,
} from './types.ts'

/** File extensions treated as searchable text. */
const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.html', '.htm', '.json', '.jsonl',
  '.yaml', '.yml', '.csv', '.log', '.js', '.mjs', '.cjs', '.ts',
  '.py', '.java', '.c', '.cpp', '.h', '.rs', '.go', '.rb', '.php', '.xml', '.ini',
])

/** Directories never walked (build/vendor noise). */
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '.dsh', '.idea', '.vscode', '__pycache__'])

/** Per-file size cap: larger files are skipped (bytes). */
const MAX_FILE_BYTES = 2_000_000

/** Total files scanned per directory before stopping. */
const MAX_FILES_SCAN = 500

/** Snippet length cap. */
const SNIPPET_MAX = 160

/** Recursively collect searchable files under one root (symlinks not followed). */
function walk(root: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES_SCAN) return
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      walk(full, out)
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      try {
        if (statSync(full).size <= MAX_FILE_BYTES) out.push(full)
      } catch {
        // unreadable file: skip
      }
    }
  }
}

/** Line-based AND search over one file, appending hits up to `limit`. */
function searchFile(file: string, terms: readonly string[], root: string, matches: KbMatch[], limit: number): void {
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const lines = content.split(/\r?\n/)
  const rel = relative(root, file).replaceAll('\\', '/')
  for (let index = 0; index < lines.length; index++) {
    const lower = lines[index]!.toLowerCase()
    if (terms.every(term => lower.includes(term))) {
      matches.push({
        file: rel,
        line: index + 1,
        snippet: lines[index]!.trim().slice(0, SNIPPET_MAX),
      })
      if (matches.length >= limit) return
    }
  }
}

/** Resolve the configured directory list (relative entries resolve against the process cwd). */
function resolveDirs(settings: KnowledgeBaseSettings): string[] {
  return settings.dirs.map(dir => dir.trim()).filter(dir => dir !== '').map(dir => resolve(dir))
}

/** Collect the first `limit` hits across every configured directory. */
function collectMatches(dirs: readonly string[], terms: readonly string[], limit: number): KbMatch[] {
  const matches: KbMatch[] = []
  for (const dir of dirs) {
    if (matches.length >= limit) break
    const files: string[] = []
    walk(dir, files)
    for (const file of files) {
      if (matches.length >= limit) break
      searchFile(file, terms, dir, matches, limit)
    }
  }
  return matches
}

/** Collect the file listing across every configured directory. */
function collectFiles(dirs: readonly string[], cap: number): KbFile[] {
  const files: KbFile[] = []
  for (const dir of dirs) {
    if (files.length >= cap) break
    const paths: string[] = []
    walk(dir, paths)
    for (const path of paths) {
      if (files.length >= cap) break
      try {
        const stat = statSync(path)
        files.push({
          path: relative(dir, path).replaceAll('\\', '/'),
          size: stat.size,
          modified: stat.mtimeMs,
        })
      } catch {
        // race: file vanished between walk and stat
      }
    }
  }
  return files
}

/** Services required by the knowledge-base plugin. */
export const inject = ['settings', 'systemPrompt', 'tools']

/**
 * Register the knowledge-base settings namespace, protocol hint, and tools.
 * @param ctx - host cordis context.
 */
export function apply(ctx: Context): void {
  ctx.settings.register(settingsNamespace(KB_SETTINGS_NAMESPACE), KnowledgeBaseSettingsSchema)

  ctx.systemPrompt.section({
    name: 'knowledge-base:protocol',
    order: 116,
    text: (context) => {
      if (context.agent === undefined) return ''
      return 'Local knowledge base: when the user configured knowledge-base directories (settings, 知识库), '
        + 'run kb_search before answering questions that reference local documents and ground your answer in the '
        + 'retrieved snippets; kb_list shows the available files. An unconfigured kb_search returns empty matches.'
    },
  })

  ctx.tools.register(defineTool({
    name: 'kb_search',
    description:
      'Keyword search over the configured knowledge-base directories. The query is split into whitespace-separated '
      + 'terms, matched case-insensitively on a line that contains ALL terms (AND); every hit reports the root-relative '
      + 'file, 1-based line, and a trimmed snippet. Prefer this over reading whole files when the user references '
      + 'knowledge-base material. Unconfigured directories return empty matches.',
    parameters: {
      query: { type: 'string', required: true, description: 'Space-separated search terms (AND).' },
      limit: { type: 'integer', description: 'Maximum hits (1-20, default 8).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', required: true },
          configured: { type: 'integer', required: true },
          dirs: { type: 'array', items: { type: 'string' }, required: true },
          matches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                file: { type: 'string', required: true },
                line: { type: 'integer', required: true },
                snippet: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `kb_search "${String((value as { query?: unknown }).query ?? '')}": ${String((value as { matches?: unknown[] }).matches?.length ?? 0)} hit(s).`,
      }],
    },
    async execute(args) {
      const query = String((args as { query?: unknown }).query ?? '').trim()
      const rawLimit = (args as { limit?: unknown }).limit
      const limit = typeof rawLimit === 'number' && Number.isInteger(rawLimit)
        ? Math.max(1, Math.min(20, rawLimit))
        : 8
      const settings = ctx.settings.get(settingsNamespace(KB_SETTINGS_NAMESPACE)) as KnowledgeBaseSettings | undefined
      const dirs = resolveDirs(settings ?? { dirs: [] })
      const terms = query.toLowerCase().split(/\s+/).filter(term => term !== '')
      const matches = terms.length === 0 ? [] : collectMatches(dirs, terms, limit)
      return { query, configured: dirs.length, dirs, matches }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'kb_list',
    description: 'List the files in the configured knowledge-base directories (root-relative path, size, modified time).',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          configured: { type: 'integer', required: true },
          dirs: { type: 'array', items: { type: 'string' }, required: true },
          files: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                size: { type: 'integer', required: true },
                modified: { type: 'integer', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `kb_list: ${String((value as { files?: unknown[] }).files?.length ?? 0)} file(s).`,
      }],
    },
    async execute() {
      const settings = ctx.settings.get(settingsNamespace(KB_SETTINGS_NAMESPACE)) as KnowledgeBaseSettings | undefined
      const dirs = resolveDirs(settings ?? { dirs: [] })
      const files = collectFiles(dirs, 100)
      return { configured: dirs.length, dirs, files }
    },
  }))
}
