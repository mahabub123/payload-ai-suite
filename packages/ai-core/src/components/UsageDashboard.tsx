'use client'
import { useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

interface ModuleRow {
  module: string
  calls: number
  inputTokens: number
  outputTokens: number
  costMicros: number
}

interface UsageData {
  from: string
  to: string
  modules: ModuleRow[]
  daily: { date: string; calls: number; costMicros: number; errors: number }[]
  totals: Omit<ModuleRow, 'module'>
  monthToDateMicros: number
  budget: { limitMicros: number | null; spentMicros: number; ratio: number }
}

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(micros < 10_000_000 ? 4 : 2)}`
const int = (n: number) => new Intl.NumberFormat().format(n)

const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--theme-elevation-100)', textAlign: 'right' }
const head: React.CSSProperties = { ...cell, fontWeight: 600, color: 'var(--theme-elevation-600)' }

/** Admin usage & cost dashboard (ai-settings "Usage" tab, or a custom admin view). Reads GET /api/ai/usage. */
export const UsageDashboard: React.FC = () => {
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}`
  const [days, setDays] = useState(30)
  const [data, setData] = useState<UsageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${api}/ai/usage?days=${days}`, { credentials: 'include' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`)
      setData(body as UsageData)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [api, days])

  useEffect(() => {
    void load()
  }, [load])

  const maxDay = Math.max(1, ...(data?.daily ?? []).map((d) => d.costMicros))
  const pct = data?.budget.limitMicros ? Math.min(100, Math.round(data.budget.ratio * 100)) : null

  return (
    <div style={{ display: 'grid', gap: 20, padding: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>AI usage</strong>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div style={{ color: 'var(--theme-error-500)' }}>Could not load usage: {error}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <Stat label={`Cost ${data.from} – ${data.to}`} value={usd(data.totals.costMicros)} />
            <Stat label="Calls" value={int(data.totals.calls)} />
            <Stat label="Month to date" value={usd(data.monthToDateMicros)} />
            <Stat
              label="Monthly budget"
              value={data.budget.limitMicros ? `${pct}% of ${usd(data.budget.limitMicros)}` : 'No limit'}
              tone={pct == null ? undefined : pct >= 100 ? 'error' : pct >= 80 ? 'warn' : undefined}
            />
          </div>
          {data.daily.length > 0 && (
            <div aria-label="Daily cost" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
              {data.daily.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${usd(d.costMicros)}, ${int(d.calls)} calls, ${int(d.errors)} errors`}
                  style={{ flex: 1, minWidth: 2, height: `${Math.max(2, (d.costMicros / maxDay) * 100)}%`, background: 'var(--theme-success-500)', borderRadius: 2 }}
                />
              ))}
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left' }}>Module</th>
                <th style={head}>Calls</th>
                <th style={head}>Input tokens</th>
                <th style={head}>Output tokens</th>
                <th style={head}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.modules.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...cell, textAlign: 'left' }}>
                    No AI calls in this range.
                  </td>
                </tr>
              )}
              {data.modules.map((m) => (
                <tr key={m.module}>
                  <td style={{ ...cell, textAlign: 'left' }}>{m.module}</td>
                  <td style={cell}>{int(m.calls)}</td>
                  <td style={cell}>{int(m.inputTokens)}</td>
                  <td style={cell}>{int(m.outputTokens)}</td>
                  <td style={cell}>{usd(m.costMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

const Stat: React.FC<{ label: string; value: string; tone?: 'warn' | 'error' }> = ({ label, value, tone }) => (
  <div style={{ minWidth: 160 }}>
    <div style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 600, color: tone === 'error' ? 'var(--theme-error-500)' : tone === 'warn' ? 'var(--theme-warning-500)' : undefined }}>{value}</div>
  </div>
)

export default UsageDashboard
