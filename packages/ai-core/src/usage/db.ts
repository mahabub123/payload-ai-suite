import type { Payload } from 'payload'

/**
 * Loosely typed Local API view. The suite's collections are not in the host app's generated types,
 * so calls go through this narrow shape instead of fighting CollectionSlug generics.
 */
export interface LooseDoc extends Record<string, unknown> {
  id: string | number
}

export interface LoosePayload {
  create(args: { collection: string; data: Record<string, unknown>; overrideAccess?: boolean; context?: Record<string, unknown> }): Promise<LooseDoc>
  find(args: {
    collection: string
    where?: Record<string, unknown>
    limit?: number
    pagination?: boolean
    sort?: string
    depth?: number
    overrideAccess?: boolean
    context?: Record<string, unknown>
  }): Promise<{ docs: LooseDoc[]; totalDocs: number }>
  update(args: { collection: string; id: string | number; data: Record<string, unknown>; overrideAccess?: boolean; context?: Record<string, unknown> }): Promise<LooseDoc>
  findGlobal(args: { slug: string; depth?: number; overrideAccess?: boolean; context?: Record<string, unknown> }): Promise<Record<string, unknown>>
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
}

export const loose = (payload: Payload): LoosePayload => payload as unknown as LoosePayload

export const dayKey = (d: Date): string => d.toISOString().slice(0, 10)
export const monthStart = (d: Date): string => `${d.toISOString().slice(0, 7)}-01`
export const tenantKey = (t: string | number | undefined | null): string => (t == null ? '' : String(t))
