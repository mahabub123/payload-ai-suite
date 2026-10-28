import type { Payload } from 'payload'

/** Narrow, untyped view of the Local API (collection slugs are site-defined, so generated types don't apply). */
export interface LocalAPI {
  find(args: Record<string, unknown>): Promise<{ docs: Record<string, any>[]; totalDocs: number }>
  findByID(args: Record<string, unknown>): Promise<Record<string, any>>
  create(args: Record<string, unknown>): Promise<Record<string, any>>
  update(args: Record<string, unknown>): Promise<Record<string, any>>
  sendEmail(args: Record<string, unknown>): Promise<unknown>
  jobs: { queue(args: Record<string, unknown>): Promise<unknown> }
  collections: Record<string, { config: { versions?: { drafts?: unknown } | boolean; flattenedFields?: { name: string }[] } }>
  logger: { error(...a: unknown[]): void; warn?(...a: unknown[]): void; info?(...a: unknown[]): void }
}

export const api = (payload: Payload): LocalAPI => payload as unknown as LocalAPI

export const hasDrafts = (payload: Payload, collection: string): boolean => {
  const v = api(payload).collections?.[collection]?.config?.versions
  return Boolean(v && typeof v === 'object' && v.drafts)
}

export const getPath = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj)

export const idOf = (v: unknown): string | undefined =>
  v == null ? undefined : typeof v === 'object' ? idOf((v as { id?: unknown }).id) : String(v)
