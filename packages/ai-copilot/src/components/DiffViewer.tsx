'use client'
import React, { useEffect, useState } from 'react'

interface Item {
  id: string | number
  before: Record<string, unknown>
  after: Record<string, unknown>
}
interface Changeset {
  id: string | number
  summary?: string
  targetCollection: string
  status: string
  items?: Item[]
  results?: { id: string | number; status: string; error?: string }[]
}

const show = (v: unknown) => (v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v))

/** Before/after diff of a copilot changeset with Apply / Discard. */
export const DiffViewer: React.FC<{ changesetId: string; apiRoute?: string }> = ({ changesetId, apiRoute = '/api' }) => {
  const [cs, setCs] = useState<Changeset | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const r = await fetch(`${apiRoute}/ai-copilot-changesets/${changesetId}?depth=0`, { credentials: 'include' })
    if (r.ok) setCs((await r.json()) as Changeset)
    else setError(`Could not load changeset (${r.status})`)
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesetId])

  const act = async (op: 'apply' | 'discard') => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch(`${apiRoute}/ai/copilot/changesets/${changesetId}/${op}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${changesetId}:${op}` },
        body: '{}',
      })
      if (!r.ok) setError(((await r.json().catch(() => ({}))) as { message?: string }).message ?? `Failed (${r.status})`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!cs) return <div style={{ fontSize: 12, opacity: 0.7 }}>{error ?? 'Loading changes…'}</div>
  const result = new Map((cs.results ?? []).map((r) => [String(r.id), r]))
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 8, margin: '6px 0', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {cs.summary ?? cs.targetCollection} — <em>{cs.status}</em>
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto' }}>
        {(cs.items ?? []).map((it) => (
          <div key={String(it.id)} style={{ borderTop: '1px solid var(--theme-elevation-100)', padding: '4px 0' }}>
            <div style={{ opacity: 0.7 }}>
              {cs.targetCollection}/{String(it.id)} {result.get(String(it.id)) ? `· ${result.get(String(it.id))!.status}` : ''}
            </div>
            {Object.keys(it.after).map((f) => (
              <div key={f} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 4 }}>
                <code>{f}</code>
                <span style={{ background: 'var(--theme-error-50)', textDecoration: 'line-through' }}>{show(it.before[f])}</span>
                <span style={{ background: 'var(--theme-success-50)' }}>{show(it.after[f])}</span>
              </div>
            ))}
          </div>
        ))}
        {!cs.items?.length && <div>No changes.</div>}
      </div>
      {error && <div style={{ color: 'var(--theme-error-500)' }}>{error}</div>}
      {(cs.status === 'proposed' || cs.status === 'failed') && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button type="button" disabled={busy || !cs.items?.length} onClick={() => act('apply')}>
            Apply
          </button>
          <button type="button" disabled={busy} onClick={() => act('discard')}>
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
