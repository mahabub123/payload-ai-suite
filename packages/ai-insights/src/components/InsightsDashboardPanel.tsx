'use client'
import React, { useEffect, useState } from 'react'
import { fetchReports, useInsightsApi, type ReportRow } from './useInsightsApi'

/** Dashboard panel: latest briefing and anomaly alerts. Hidden for users who cannot read reports. */
export const InsightsDashboardPanel: React.FC = () => {
  const { api, admin } = useInsightsApi()
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  useEffect(() => {
    fetchReports(api, { limit: 4, kinds: ['briefing', 'anomaly'] }).then(setRows).catch(() => setRows([]))
  }, [api])
  if (!rows || rows.length === 0) return null
  const briefing = rows.find((r) => r.kind === 'briefing')
  const anomalies = rows.filter((r) => r.kind === 'anomaly').slice(0, 2)
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150, #ddd)', borderRadius: 6, padding: 16, margin: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>AI Insights</h3>
        <a href={`${admin}/ai-insights`}>Ask your data →</a>
      </div>
      {anomalies.map((a) => (
        <div key={a.id} style={{ marginTop: 10, padding: 8, borderLeft: '3px solid var(--theme-warning-500, #e0a100)' }}>
          <strong>{a.question}</strong>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{a.answer}</div>
        </div>
      ))}
      {briefing && (
        <div style={{ marginTop: 10 }}>
          <strong>{briefing.question}</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {(briefing.answer ?? '').split('\n').filter(Boolean).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default InsightsDashboardPanel
