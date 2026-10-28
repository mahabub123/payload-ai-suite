/**
 * Vector store on the site's Postgres (design doc §7.4): pgvector + full-text hybrid with RRF.
 * Raw, parameterized SQL through the db-postgres pool. Identifiers are validated, values are bound.
 * When pgvector is unavailable the store runs keyword-only (full-text tables without embeddings).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Payload } from 'payload'
import type { VectorQuery, VectorRow, VectorStore, VectorTableSpec } from '../contracts'
import { AIError } from '../contracts'

export type VectorMode = 'vector' | 'keyword' | 'unknown'

export interface PgStore extends VectorStore {
  mode(): VectorMode
  /** Distinct embedding models stored for a tenant (index bookkeeping). */
  models(table: string, tenant?: string | number): Promise<string[]>
  /** Delete every row whose model is not `keepModel` (embedding-model swap). */
  purgeOtherModels(table: string, keepModel: string, tenant?: string | number): Promise<number>
}

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>
}

const IDENT = /^[a-z_][a-z0-9_]*$/
const RESERVED = new Set(['id', 'tenant', 'locale', 'model', 'content', 'tsv', 'embedding', 'updated_at'])
const TYPE = /^[a-z][a-z0-9_ ]*(\(\d+(,\s*\d+)?\))?(\[\])?$/i

export const assertIdent = (name: string): string => {
  if (!IDENT.test(name) || name.length > 63) throw new AIError('bad_request', `Invalid SQL identifier: ${JSON.stringify(name)}`)
  return name
}

const validateSpec = (spec: VectorTableSpec) => {
  assertIdent(spec.name)
  for (const [col, type] of Object.entries(spec.columns)) {
    assertIdent(col)
    if (RESERVED.has(col)) throw new AIError('bad_request', `Column ${col} is reserved`)
    if (!TYPE.test(type)) throw new AIError('bad_request', `Invalid SQL type for ${col}: ${JSON.stringify(type)}`)
  }
}

const tenantKey = (t?: string | number) => (t === undefined || t === null ? '' : String(t))

/** DDL for one table. `dims` null => keyword-only (no extension, no embedding column). */
const tableDDL = (spec: VectorTableSpec, dims: number | null): string[] => {
  validateSpec(spec)
  const t = spec.name
  const extra = Object.entries(spec.columns).map(([c, type]) => `  ${c} ${type},`)
  const out: string[] = []
  if (dims !== null) {
    if (!Number.isInteger(dims) || dims <= 0 || dims > 16000) throw new AIError('bad_request', `Invalid dims ${dims}`)
    out.push('CREATE EXTENSION IF NOT EXISTS vector')
  }
  out.push(
    [
      `CREATE TABLE IF NOT EXISTS ${t} (`,
      '  id text NOT NULL,',
      "  tenant text NOT NULL DEFAULT '',",
      '  locale text,',
      '  model text NOT NULL,',
      '  content text NOT NULL,',
      "  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED,",
      ...(dims !== null ? [`  embedding vector(${dims}),`] : []),
      ...extra,
      '  updated_at timestamptz NOT NULL DEFAULT now(),',
      '  PRIMARY KEY (tenant, model, id)',
      ')',
    ].join('\n'),
  )
  out.push(`CREATE INDEX IF NOT EXISTS ${t}_tsv_idx ON ${t} USING gin (tsv)`)
  out.push(`CREATE INDEX IF NOT EXISTS ${t}_scope_idx ON ${t} (tenant, model, locale)`)
  if (dims !== null) out.push(`CREATE INDEX IF NOT EXISTS ${t}_embedding_idx ON ${t} USING hnsw (embedding vector_cosine_ops)`)
  return out
}

/** SQL for a committed migration (vector mode). */
export const vectorMigrationSQL = (spec: VectorTableSpec, dims: number): string => tableDDL(spec, dims).join(';\n') + ';\n'

const pad = (n: number) => String(n).padStart(2, '0')

/** Write a Payload (db-postgres) migration file creating the given vector tables. Returns the file path. */
export const writeVectorMigration = async (opts: {
  dir: string
  name?: string
  tables: { spec: VectorTableSpec; dims: number }[]
}): Promise<string> => {
  const d = new Date()
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  const name = (opts.name ?? 'ai_suite_vectors').replace(/[^a-z0-9_]/gi, '_')
  const up = opts.tables.map((t) => vectorMigrationSQL(t.spec, t.dims)).join('\n')
  const down = opts.tables.map((t) => `DROP TABLE IF EXISTS ${assertIdent(t.spec.name)};`).join('\n')
  const src = [
    "import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'",
    '',
    'export async function up({ db }: MigrateUpArgs): Promise<void> {',
    `  await db.execute(sql.raw(${JSON.stringify(up)}))`,
    '}',
    '',
    'export async function down({ db }: MigrateDownArgs): Promise<void> {',
    `  await db.execute(sql.raw(${JSON.stringify(down)}))`,
    '}',
    '',
  ].join('\n')
  await mkdir(opts.dir, { recursive: true })
  const file = join(opts.dir, `${stamp}_${name}.ts`)
  await writeFile(file, src, 'utf8')
  return file
}

/** `ai-suite` migration helper alias. */
export const aiSuiteMigration = writeVectorMigration

/** Reciprocal rank fusion: score = Σ 1 / (k + rank). Ties keep first-seen order. */
export const rrfMerge = <T extends { id: string }>(lists: T[][], k = 60): (T & { score: number })[] => {
  const acc = new Map<string, { item: T; score: number; first: number }>()
  let order = 0
  for (const list of lists) {
    list.forEach((item, i) => {
      const prev = acc.get(item.id)
      const s = 1 / (k + i + 1)
      if (prev) prev.score += s
      else acc.set(item.id, { item, score: s, first: order++ })
    })
  }
  return [...acc.values()]
    .sort((a, b) => b.score - a.score || a.first - b.first)
    .map(({ item, score }) => ({ ...item, score }))
}

const toVectorLiteral = (v: number[]) => {
  if (!v.every((x) => Number.isFinite(x))) throw new AIError('bad_request', 'Embedding contains non-finite values')
  return `[${v.join(',')}]`
}

const resolveClient = (payload: Payload | undefined): Queryable => {
  const db = payload?.db as unknown as { pool?: Queryable; drizzle?: { $client?: Queryable } } | undefined
  const c = db?.pool ?? db?.drizzle?.$client
  if (!c || typeof c.query !== 'function') {
    throw new AIError('unavailable', 'Vector store needs @payloadcms/db-postgres (no pg pool found on payload.db)')
  }
  return c
}

export const createVectorStore = (opts: { payload: () => Payload | undefined }): PgStore => {
  let mode: VectorMode = 'unknown'
  let detecting: Promise<VectorMode> | null = null
  const specs = new Map<string, VectorTableSpec>()
  const ensured = new Map<string, Promise<void>>()

  const client = () => resolveClient(opts.payload())
  const q = (text: string, params: unknown[] = []) => client().query(text, params)

  const detect = (): Promise<VectorMode> => {
    if (mode !== 'unknown') return Promise.resolve(mode)
    detecting ??= (async () => {
      try {
        await q('CREATE EXTENSION IF NOT EXISTS vector')
        mode = 'vector'
      } catch (err) {
        let installed = false
        try {
          const r = await q("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
          installed = r.rows.length > 0
        } catch {
          installed = false
        }
        mode = installed ? 'vector' : 'keyword'
        if (!installed) {
          opts.payload()?.logger?.warn(
            `[ai-suite] ⚠️  pgvector is NOT available in this Postgres (${(err as Error)?.message ?? err}). ` +
              'Running KEYWORD-ONLY retrieval: semantic search and similar-item recommendations are disabled. ' +
              'Install the pgvector extension and restart to enable hybrid search.',
          )
        }
      }
      return mode
    })()
    return detecting
  }

  const columnsOf = (table: string, fields?: Record<string, unknown>) => {
    const spec = specs.get(table)
    if (spec) return Object.keys(spec.columns)
    return Object.keys(fields ?? {}).filter((c) => IDENT.test(c) && !RESERVED.has(c))
  }

  const ensureTable = async (spec: VectorTableSpec, dims: number) => {
    validateSpec(spec)
    specs.set(spec.name, spec)
    const key = spec.name
    if (!ensured.has(key)) {
      const p = (async () => {
        const m = await detect()
        for (const stmt of tableDDL(spec, m === 'vector' ? dims : null)) {
          if (stmt.startsWith('CREATE EXTENSION')) continue
          await q(stmt)
        }
      })()
      ensured.set(key, p)
      p.catch(() => ensured.delete(key))
    }
    await ensured.get(key)
  }

  const upsert = async (table: string, rows: VectorRow[], meta: { tenant?: string | number; locale?: string; model: string }) => {
    assertIdent(table)
    if (!rows.length) return
    const m = await detect()
    const cols = columnsOf(table, rows[0]?.fields)
    const base = ['id', 'tenant', 'locale', 'model', 'content', ...(m === 'vector' ? ['embedding'] : []), ...cols]
    for (const r of rows) {
      const params: unknown[] = [r.id, tenantKey(meta.tenant), meta.locale ?? null, meta.model, r.content]
      if (m === 'vector') params.push(r.embedding?.length ? toVectorLiteral(r.embedding) : null)
      for (const c of cols) params.push(r.fields?.[c] ?? null)
      const placeholders = base.map((c, i) => (c === 'embedding' ? `$${i + 1}::vector` : `$${i + 1}`))
      const updates = base
        .filter((c) => c !== 'id' && c !== 'tenant' && c !== 'model')
        .map((c) => `${c} = EXCLUDED.${c}`)
      await q(
        `INSERT INTO ${table} (${base.join(', ')}) VALUES (${placeholders.join(', ')}) ` +
          `ON CONFLICT (tenant, model, id) DO UPDATE SET ${[...updates, 'updated_at = now()'].join(', ')}`,
        params,
      )
    }
  }

  const del = async (table: string, ids: string[], tenant?: string | number) => {
    assertIdent(table)
    if (!ids.length) return
    await q(`DELETE FROM ${table} WHERE tenant = $1 AND id = ANY($2::text[])`, [tenantKey(tenant), ids])
  }

  /** Builds the shared scope + where-filter SQL. Returns clause list and params (starting at `start`). */
  const buildFilters = (
    table: string,
    q: VectorQuery,
    scope: { tenant?: string | number; locale?: string; model?: string },
    params: unknown[],
  ): string[] => {
    const add = (v: unknown) => {
      params.push(v)
      return `$${params.length}`
    }
    const clauses = [`tenant = ${add(tenantKey(scope.tenant))}`]
    if (scope.model) clauses.push(`model = ${add(scope.model)}`)
    if (scope.locale) clauses.push(`(locale = ${add(scope.locale)} OR locale IS NULL)`)
    const allowed = new Set(columnsOf(table))
    for (const [col, v] of Object.entries(q.where ?? {})) {
      if (v === undefined) continue
      assertIdent(col)
      if (!allowed.has(col)) throw new AIError('bad_request', `Unknown filter column ${col} on ${table}`)
      if (v === null) clauses.push(`${col} IS NULL`)
      else if (Array.isArray(v)) clauses.push(`${col} = ANY(${add(v)})`)
      else if (typeof v === 'object') {
        const o = v as { gte?: unknown; lte?: unknown; contains?: unknown }
        if (o.contains !== undefined) clauses.push(`${add(o.contains)} = ANY(${col})`)
        if (o.gte !== undefined) clauses.push(`${col} >= ${add(o.gte)}`)
        if (o.lte !== undefined) clauses.push(`${col} <= ${add(o.lte)}`)
      } else clauses.push(`${col} = ${add(v)}`)
    }
    return clauses
  }

  type Hit = { id: string; score: number; content: string; fields: Record<string, unknown> }
  const toHit = (table: string, row: Record<string, unknown>): Hit => {
    const fields: Record<string, unknown> = {}
    for (const c of columnsOf(table)) fields[c] = row[c]
    fields.locale = row.locale
    return { id: String(row.id), score: Number(row.score ?? 0), content: String(row.content ?? ''), fields }
  }

  const query: VectorStore['query'] = async (table, vq, scope) => {
    assertIdent(table)
    const m = await detect()
    const k = Math.max(1, Math.min(vq.k, 1000))
    const n = Math.min(Math.max(k * 4, 50), 200)
    const cols = columnsOf(table)
    const select = ['id', 'content', 'locale', ...cols].join(', ')
    const useVector = Boolean(vq.embedding?.length) && m === 'vector'
    const useText = Boolean(vq.text?.trim())

    const vectorPart = async (limit: number) => {
      const params: unknown[] = []
      const where = buildFilters(table, vq, scope, params)
      params.push(toVectorLiteral(vq.embedding!))
      const p = `$${params.length}::vector`
      params.push(limit)
      const r = await q(
        `SELECT ${select}, 1 - (embedding <=> ${p}) AS score FROM ${table} ` +
          `WHERE ${where.join(' AND ')} AND embedding IS NOT NULL ORDER BY embedding <=> ${p} LIMIT $${params.length}`,
        params,
      )
      return r.rows.map((row) => toHit(table, row))
    }
    const textQuery = async (limit: number, tsquery: (p: string) => string, excludeIds: string[] = []) => {
      const params: unknown[] = []
      const where = buildFilters(table, vq, scope, params)
      params.push(vq.text!.trim())
      const tq = tsquery(`$${params.length}`)
      if (excludeIds.length) {
        params.push(excludeIds)
        where.push(`NOT (id = ANY($${params.length}))`)
      }
      params.push(limit)
      const r = await q(
        `SELECT ${select}, ts_rank(tsv, ${tq}) AS score FROM ${table} ` +
          `WHERE ${where.join(' AND ')} AND tsv @@ ${tq} ORDER BY score DESC, id LIMIT $${params.length}`,
        params,
      )
      return r.rows.map((row) => toHit(table, row))
    }
    // Every word must match first (respects quotes and -negation); natural-language queries
    // ("do you have a cotton saree?") then fall back to any-word matches, ranked below.
    const textPart = async (limit: number) => {
      const all = await textQuery(limit, (p) => `websearch_to_tsquery('simple', ${p})`)
      if (all.length >= limit || !/\s/.test(vq.text!.trim())) return all
      const any = await textQuery(
        limit - all.length,
        (p) => `replace(plainto_tsquery('simple', ${p})::text, '&', '|')::tsquery`,
        all.map((h) => h.id),
      )
      // Shift any-word scores below zero, keeping their relative order (ts_rank is never negative).
      const offset = Math.max(0, ...any.map((h) => h.score)) + 1
      return [...all, ...any.map((h) => ({ ...h, score: h.score - offset }))]
    }

    if (useVector && useText) {
      const [a, b] = await Promise.all([vectorPart(n), textPart(n)])
      return rrfMerge([a, b], vq.rrfK ?? 60)
        .slice(0, k)
        .map((h) => ({ id: h.id, score: h.score, content: h.content, fields: h.fields }))
    }
    if (useVector) return vectorPart(k)
    if (useText) return textPart(k)
    if (vq.embedding?.length) return [] // keyword mode, no text to fall back on
    // Filter-only listing (bookkeeping, e.g. existing chunk hashes).
    const params: unknown[] = []
    const where = buildFilters(table, vq, scope, params)
    params.push(k)
    const r = await q(`SELECT ${select}, 0 AS score FROM ${table} WHERE ${where.join(' AND ')} ORDER BY id LIMIT $${params.length}`, params)
    return r.rows.map((row) => toHit(table, row))
  }

  return {
    mode: () => mode,
    ensureTable,
    upsert,
    delete: del,
    query,
    migrationSQL: vectorMigrationSQL,
    async models(table, tenant) {
      assertIdent(table)
      const r = await q(`SELECT DISTINCT model FROM ${table} WHERE tenant = $1`, [tenantKey(tenant)])
      return r.rows.map((x) => String(x.model))
    },
    async purgeOtherModels(table, keepModel, tenant) {
      assertIdent(table)
      const r = await q(`DELETE FROM ${table} WHERE tenant = $1 AND model <> $2`, [tenantKey(tenant), keepModel])
      return r.rowCount ?? 0
    },
  }
}
