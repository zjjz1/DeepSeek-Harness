/**
 * Knowledge-base durable settings vocabulary.
 * The directory list is the only durable state; search results are computed
 * per call and never persisted.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the knowledge-base plugin. */
export const KB_SETTINGS_NAMESPACE = 'knowledge-base'

/** Durable knowledge-base settings. */
export interface KnowledgeBaseSettings {
  /** Absolute (or process-cwd-relative) document directories, in search order. */
  dirs: string[]
}

/** Settings-boundary schema for the knowledge-base namespace. */
export const KnowledgeBaseSettingsSchema: z<KnowledgeBaseSettings> = z.object({
  dirs: z.array(z.string()).default([]),
})

/** One search hit: file (root-relative), 1-based line, trimmed snippet. */
export interface KbMatch {
  file: string
  line: number
  snippet: string
}

/** One indexed file listed by kb_list. */
export interface KbFile {
  /** Root-relative path with forward slashes. */
  path: string
  /** File size in bytes. */
  size: number
  /** Last modified epoch ms. */
  modified: number
}
