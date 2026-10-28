import type { SuiteRole } from 'payload-ai-core'
import type { StructuredFilter } from '../filter'

export type StepType = 'classify' | 'summarize' | 'draft' | 'extract'
export type RunStatus = 'queued' | 'running' | 'awaiting-approval' | 'approved' | 'rejected' | 'done' | 'failed'

export interface AutomationDefinition {
  id?: string | number
  name: string
  enabled: boolean
  trigger:
    | { type: 'collection'; collection: string; operation: 'create' | 'update' | 'delete'; condition?: StructuredFilter | null; cron?: null }
    | { type: 'schedule'; cron: string; collection?: null; operation?: null; condition?: null }
  steps: { type: StepType; promptSlug?: string | null; instructions?: string | null; outputKey: string }[]
  approval?: { required?: boolean | null; role?: SuiteRole | null }
  action: {
    type: 'notify' | 'create-draft' | 'tag'
    when?: StructuredFilter | null
    channel?: 'admin' | 'email' | null
    emailTo?: string[] | null
    subject?: string | null
    collection?: string | null
    fieldMapping?: Record<string, string> | null
    field?: string | null
    valueFrom?: string | null
  }
  lastScheduledAt?: string | null
  tenant?: unknown
}
