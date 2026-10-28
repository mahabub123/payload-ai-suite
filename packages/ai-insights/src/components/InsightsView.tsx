'use client'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Card } from '@payload-ai-suite/ai-core/wire'
import { Chart } from './Chart'
import { readSSE } from './sse'
import { fetchReports, useInsightsApi, type ReportRow } from './useInsightsApi'

type ChartCard = Extract<Card, { type: 'chart' }>

const PERIODS: [string, string][] = [
  ['', 'Let the question decide'],
  ['yesterday', 'Yesterday'],
  ['last7d', 'Last 7 days'],
  ['last28d', 'Last 28 days'],
  ['thisMonth', 'This month'],
  ['lastMonth', 'Last month'],
  ['last90d', 'Last 90 days'],
  ['thisYear', 'This year'],
]

const EXAMPLES = ['How did revenue do last week vs the week before?', 'What were my top 5 products this month?', 'How many searches found nothing in the last 28 days?']

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150, #ddd)', borderRadius: 6, padding: 16, marginBottom: 16 }

/** Admin view at /admin/ai-insights: "Ask your data". */
export const InsightsView: React.FC = () => {
  const { api } = useInsightsApi()
  const [question, setQuestion] = useState('')
  const [period, setPeriod] = useState('')
  const [answer, setAnswer] = useState('')
  const [charts, setCharts] = useState<ChartCard[]>([])
  const [tools, setTools] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [outcome, setOutcome] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [recent, setRecent] = useState<ReportRow[]>([])
  const abort = useRef<AbortController | null>(null)

  const loadRecent = useCallback(() => {
    fetchReports(api, { limit: 10 }).then(setRecent).catch(() => setRecent([]))
  }, [api])
  useEffect(loadRecent, [loadRecent])

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (question.trim().length < 3 || status === 'streaming') return
    abort.current?.abort()
    abort.current = new AbortController()
    setAnswer('')
    setCharts([])
    setTools([])
    setError(undefined)
    setOutcome(undefined)
    setStatus('streaming')
    try {
      const res = await fetch(`${api}/ai/insights/ask`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ question, ...(period ? { period } : {}) }),
        signal: abort.current.signal,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `Request failed (${res.status})`)
      }
      for await (const ev of readSSE(res)) {
        if (ev.type === 'text') setAnswer((a) => a + ev.delta)
        else if (ev.type === 'card' && ev.card.type === 'chart') setCharts((c) => [...c, ev.card as ChartCard])
        else if (ev.type === 'tool' && ev.status === 'started') setTools((t) => [...t, ev.name])
        else if (ev.type === 'error') throw new Error(ev.message)
        else if (ev.type === 'done') setOutcome(ev.outcome)
      }
      setStatus('done')
      loadRecent()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message)
      setStatus('error')
    }
  }

  const show = (r: ReportRow) => {
    setQuestion(r.kind === 'ask' ? r.question : '')
    setAnswer(r.answer ?? '')
    setCharts((r.charts ?? []) as ChartCard[])
    setTools([])
    setOutcome(r.verification)
    setStatus('done')
  }

  return (
    <div style={{ padding: 'var(--gutter-h, 24px)', maxWidth: 960 }}>
      <h1 style={{ marginBottom: 4 }}>Ask your data</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        Answers use typed metric tools over your store data. Numbers are checked against the tool results.
      </p>
      <form onSubmit={ask} style={box}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask()
          }}
          rows={3}
          maxLength={1000}
          placeholder="e.g. How did revenue do last week vs the week before?"
          style={{ width: '100%', padding: 8, fontSize: 14, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: 6 }}>
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <button type="submit" className="btn btn--style-primary btn--size-small" disabled={status === 'streaming' || question.trim().length < 3}>
            {status === 'streaming' ? 'Thinking…' : 'Ask'}
          </button>
          {status === 'streaming' && (
            <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => { abort.current?.abort(); setStatus('idle') }}>
              Stop
            </button>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          {EXAMPLES.map((q) => (
            <button key={q} type="button" onClick={() => setQuestion(q)} style={{ marginRight: 8, marginTop: 4, background: 'none', border: '1px dashed currentColor', borderRadius: 12, padding: '2px 10px', cursor: 'pointer', color: 'inherit' }}>
              {q}
            </button>
          ))}
        </div>
      </form>

      {(answer || charts.length > 0 || status === 'streaming' || error) && (
        <section style={box} aria-live="polite">
          {tools.length > 0 && <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Metrics used: {[...new Set(tools)].join(', ')}</div>}
          {error && <div style={{ color: 'var(--theme-error-500, #c00)' }}>{error}</div>}
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{answer || (status === 'streaming' ? '…' : '')}</div>
          {charts.map((c, i) => (
            <Chart key={`${c.title}-${i}`} title={c.title} kind={c.kind} series={c.series} />
          ))}
          {outcome && (
            <div style={{ fontSize: 12, marginTop: 8, opacity: 0.8 }}>
              Number check: <strong>{outcome}</strong>
            </div>
          )}
        </section>
      )}

      <section style={box}>
        <h3 style={{ marginTop: 0 }}>Recent reports</h3>
        {recent.length === 0 && <div style={{ opacity: 0.7 }}>No reports yet.</div>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {recent.map((r) => (
            <li key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--theme-elevation-100, #eee)' }}>
              <button type="button" onClick={() => show(r)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', opacity: 0.6, marginRight: 8 }}>{r.kind}</span>
                {r.question}
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>{new Date(r.createdAt).toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default InsightsView
