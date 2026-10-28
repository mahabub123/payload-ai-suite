'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { Button, Gutter, toast, useConfig } from '@payloadcms/ui'
import { adminBase, errorMessage, getJSON } from './api'

interface ReviewItem {
  id: string
  docId: string
  field: string
  fieldType: string
  output: string
  accepted: boolean | null
  appliedAt: string | null
}

interface ReviewData {
  run: {
    id: string
    title: string
    status: string
    collection: string
    action: string
    total: number
    processed: number
    failed: number
    errors: { id: string; message: string }[]
    drafts: boolean
  }
  items: ReviewItem[]
  page: number
  totalPages: number
  totalItems: number
}

const runIdFromPath = (): string => {
  if (typeof window === 'undefined') return ''
  const m = window.location.pathname.match(/\/ai-content\/bulk\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

const statusLabel = (a: boolean | null) => (a === true ? 'Accepted (draft)' : a === false ? 'Discarded' : 'Pending')

/** Admin view /admin/ai-content/bulk/:runId — accept all / each, or discard. */
export const BulkReviewView: React.FC = () => {
  const { config } = useConfig()
  const [runId] = useState(runIdFromPath)
  const [data, setData] = useState<ReviewData | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!runId) return
    try {
      setData(await getJSON<ReviewData>(config, `/ai/content/bulk/${encodeURIComponent(runId)}?page=${page}&limit=100`))
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [config, runId, page])

  useEffect(() => {
    void load()
  }, [load])

  const running = data?.run.status === 'queued' || data?.run.status === 'running'
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [running, load])

  const review = async (body: unknown) => {
    setBusy(true)
    try {
      const r = await getJSON<{ accepted: number; discarded: number; failed: { docId: string; message: string }[] }>(
        config,
        `/ai/content/bulk/${encodeURIComponent(runId)}/review`,
        { body },
      )
      toast.success(`${r.accepted} accepted, ${r.discarded} discarded${r.failed.length ? `, ${r.failed.length} failed` : ''}`)
      for (const f of r.failed.slice(0, 3)) toast.error(`${f.docId}: ${f.message}`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!runId) return <Gutter>Missing run id.</Gutter>
  if (error) return <Gutter><p style={{ color: 'var(--theme-error-500)' }}>{error}</p></Gutter>
  if (!data) return <Gutter>Loading…</Gutter>
  const { run, items } = data
  const pending = items.some((i) => i.accepted == null)

  return (
    <Gutter>
      <h1 style={{ marginTop: 24 }}>AI bulk review</h1>
      <p>
        {run.title} — <strong>{run.status}</strong> · {run.processed}/{run.total} processed{run.failed ? ` · ${run.failed} failed` : ''}
      </p>
      <p style={{ fontSize: 13, opacity: 0.8 }}>
        {run.drafts
          ? 'Accepted values are saved as drafts. Publish each document yourself after checking it.'
          : 'This collection has no drafts: accepted values are saved to the document directly (nothing else changes).'}
      </p>
      {running && <p>Generating… this page refreshes automatically.</p>}
      {run.errors?.length > 0 && (
        <details>
          <summary>{run.errors.length} errors</summary>
          <ul>
            {run.errors.map((e, i) => (
              <li key={i}>
                {e.id}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <Button disabled={busy || !pending || running} onClick={() => void review({ decision: 'accept-all' })}>
          Accept all pending
        </Button>
        <Button buttonStyle="secondary" disabled={busy || !pending} onClick={() => void review({ decision: 'discard-all' })}>
          Discard all pending
        </Button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--theme-elevation-150)' }}>
            <th>Document</th>
            <th>Field</th>
            <th style={{ width: '55%' }}>AI output</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: '1px solid var(--theme-elevation-100)', verticalAlign: 'top' }}>
              <td>
                <a href={`${adminBase(config)}/collections/${run.collection}/${it.docId}`} target="_blank" rel="noreferrer">
                  {it.docId}
                </a>
              </td>
              <td>{it.field}</td>
              <td>
                <div style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{it.output}</div>
              </td>
              <td>{statusLabel(it.accepted)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {it.accepted == null && (
                  <>
                    <Button size="small" disabled={busy} onClick={() => void review({ items: [{ id: it.id, accept: true }] })}>
                      Accept
                    </Button>{' '}
                    <Button size="small" buttonStyle="subtle" disabled={busy} onClick={() => void review({ items: [{ id: it.id, accept: false }] })}>
                      Discard
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {data.page} / {data.totalPages}
          </span>
          <Button size="small" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </Gutter>
  )
}

export default BulkReviewView
