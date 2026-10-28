import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createVectorStore, vectorMigrationSQL } from './index'

const spec = { name: 'ai_things', columns: { price: 'integer', category_ids: 'text[]' } }

const fakePool = (opts: { pgvector: boolean }) => {
  const calls: { text: string; params?: unknown[] }[] = []
  return {
    calls,
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params })
      if (/CREATE EXTENSION/.test(text) && !opts.pgvector) throw new Error('extension "vector" is not available')
      if (/pg_extension/.test(text)) return { rows: [] }
      return { rows: [], rowCount: 0 }
    },
  }
}

const payloadWith = (pool: ReturnType<typeof fakePool>) => {
  const warn = vi.fn()
  return { payload: { db: { pool }, logger: { warn, info: vi.fn(), error: vi.fn() } } as unknown as Payload, warn }
}

describe('vectorMigrationSQL', () => {
  it('creates extension, table with tsvector + embedding, GIN and HNSW cosine indexes', () => {
    const sql = vectorMigrationSQL(spec, 1536)
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector')
    expect(sql).toContain('embedding vector(1536)')
    expect(sql).toMatch(/tsv tsvector GENERATED ALWAYS AS/)
    expect(sql).toContain('USING hnsw (embedding vector_cosine_ops)')
    expect(sql).toContain('USING gin (tsv)')
    expect(sql).toContain('category_ids text[]')
    expect(sql).toContain('PRIMARY KEY (tenant, model, id)')
  })

  it('rejects unsafe identifiers and types', () => {
    expect(() => vectorMigrationSQL({ name: 'x; DROP TABLE users', columns: {} }, 8)).toThrow(/identifier/)
    expect(() => vectorMigrationSQL({ name: 'ok', columns: { 'a"b': 'text' } }, 8)).toThrow(/identifier/)
    expect(() => vectorMigrationSQL({ name: 'ok', columns: { a: 'text); DROP' } }, 8)).toThrow(/type/)
    expect(() => vectorMigrationSQL({ name: 'ok', columns: { embedding: 'text' } }, 8)).toThrow(/reserved/)
  })
})

describe('createVectorStore', () => {
  it('falls back to keyword-only mode with one loud warning when pgvector is missing', async () => {
    const pool = fakePool({ pgvector: false })
    const { payload, warn } = payloadWith(pool)
    const store = createVectorStore({ payload: () => payload })
    await store.ensureTable(spec, 64)
    await store.ensureTable({ ...spec, name: 'ai_other' }, 64)
    expect(store.mode()).toBe('keyword')
    expect(warn).toHaveBeenCalledTimes(1)
    const ddl = pool.calls.map((c) => c.text).filter((t) => t.startsWith('CREATE'))
    expect(ddl.join('\n')).not.toMatch(/embedding vector/)
    expect(ddl.join('\n')).not.toContain('hnsw')
    // vector-only queries degrade to nothing, text queries still run full-text SQL
    expect(await store.query('ai_things', { embedding: [0.1, 0.2], k: 5 }, {})).toEqual([])
    const before = pool.calls.length
    await store.query('ai_things', { embedding: [0.1], text: 'red dress', k: 5 }, {})
    const sent = pool.calls.slice(before)
    // All-words match first; with fewer than k hits, an any-word fallback follows.
    expect(sent[0].text).toContain('websearch_to_tsquery')
    expect(sent.at(-1)!.text).toContain("replace(plainto_tsquery('simple'")
    for (const c of sent) expect(c.text).not.toContain('<=>')
  })

  it('builds tenant/model scoped, parameterized hybrid queries', async () => {
    const pool = fakePool({ pgvector: true })
    const { payload } = payloadWith(pool)
    const store = createVectorStore({ payload: () => payload })
    await store.ensureTable(spec, 3)
    expect(store.mode()).toBe('vector')
    pool.calls.length = 0
    await store.query(
      'ai_things',
      { embedding: [1, 0, 0], text: "x' OR 1=1 --", k: 5, where: { price: { gte: 100, lte: 500 }, category_ids: { contains: 'c1' } } },
      { tenant: 't1', model: 'm1', locale: 'en' },
    )
    // vector + all-words text + any-word fallback (the fake pool returns no rows)
    expect(pool.calls).toHaveLength(3)
    for (const c of pool.calls) {
      expect(c.text).toContain('tenant = $1')
      expect(c.text).toContain('model = $2')
      expect(c.text).not.toContain('OR 1=1')
      expect(c.params?.[0]).toBe('t1')
    }
    expect(pool.calls.some((c) => c.text.includes('<=>'))).toBe(true)
    await expect(store.query('ai_things', { text: 'a', k: 1, where: { secret: 1 } }, {})).rejects.toThrow(/Unknown filter column/)
  })

  it('upserts with ON CONFLICT and vector cast', async () => {
    const pool = fakePool({ pgvector: true })
    const { payload } = payloadWith(pool)
    const store = createVectorStore({ payload: () => payload })
    await store.ensureTable(spec, 2)
    await store.upsert('ai_things', [{ id: 'p1', content: 'hello', embedding: [0.5, 0.5], fields: { price: 100, category_ids: ['a'] } }], { model: 'm' })
    const ins = pool.calls.at(-1)!
    expect(ins.text).toContain('ON CONFLICT (tenant, model, id)')
    expect(ins.text).toContain('::vector')
    expect(ins.params).toEqual(['p1', '', null, 'm', 'hello', '[0.5,0.5]', 100, ['a']])
  })
})
