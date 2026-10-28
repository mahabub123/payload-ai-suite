import type { Config } from 'payload'
import type { AICoreOptions, SuiteRole } from 'payload-ai-core'
import { getSuiteState } from 'payload-ai-core'

export interface AiCopilotOptions {
  /** Event/schedule-driven AI workflows. Default true. */
  automations?: boolean
  /**
   * Collections the copilot may read and propose edits on.
   * Default: every concept collection mapped by the adapters + 'pages' and 'posts' (when they exist).
   */
  collections?: string[]
  /** Max documents per bulk-edit changeset. Default 200. */
  maxBulkItems?: number
  /** Role that may approve automation runs when the automation does not name one. Default 'store-admin'. */
  defaultApprovalRole?: SuiteRole
  /** Register the copilot drawer in the admin (admin.components.providers). Default true. */
  adminPanel?: boolean
}

export interface ResolvedCopilotOptions {
  automations: boolean
  collections: string[]
  maxBulkItems: number
  defaultApprovalRole: SuiteRole
  adminPanel: boolean
  tenantField?: string
}

export const resolveOptions = (config: Config, options: AiCopilotOptions = {}): ResolvedCopilotOptions => {
  const core = getSuiteState(config)?.options as AICoreOptions | undefined
  const present = new Set((config.collections ?? []).map((c) => c.slug))
  let collections = options.collections
  if (!collections) {
    const mapped = core?.adapters?.mappedCollections?.() ?? {}
    collections = [...new Set([...Object.values(mapped).flatMap((v) => v ?? []), 'pages', 'posts'])]
  }
  return {
    automations: options.automations ?? true,
    collections: collections.filter((c) => present.has(c) && !c.startsWith('ai-') && !c.startsWith('payload-')),
    maxBulkItems: options.maxBulkItems ?? 200,
    defaultApprovalRole: options.defaultApprovalRole ?? 'store-admin',
    adminPanel: options.adminPanel ?? true,
    tenantField: core?.tenant?.field,
  }
}

/** Fields no copilot write may touch. */
export const PROTECTED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', '_status', 'password', 'salt', 'hash', 'roles', 'role', 'apiKey', 'resetPasswordToken'])

export const COPILOT_CONTEXT_FLAG = 'aiCopilotWrite'
