'use client'
import React from 'react'
import type { ChartSeries } from '@payload-ai-suite/ai-core/wire'

const COLORS = ['#2f6fdb', '#e07b39', '#2a9d8f', '#b5179e', '#8a8a8a', '#e9c46a']
const W = 560
const H = 220
const PAD = { l: 52, r: 12, t: 12, b: 40 }

const fmt = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v * 100) / 100}`

export interface ChartProps {
  title: string
  kind: 'line' | 'bar' | 'pie' | 'table'
  series: ChartSeries[]
}

/** Dependency-free SVG chart for insight chart cards. */
export const Chart: React.FC<ChartProps> = ({ title, kind, series }) => {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => String(p.x))))]
  const ys = series.flatMap((s) => s.points.map((p) => p.y))
  const max = Math.max(0, ...ys)
  const min = Math.min(0, ...ys)
  const span = max - min || 1
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + ih - ((v - min) / span) * ih
  const x = (i: number) => PAD.l + (xs.length <= 1 ? iw / 2 : (i / (xs.length - 1)) * iw)
  const labelEvery = Math.max(1, Math.ceil(xs.length / 8))

  let body: React.ReactNode
  if (kind === 'table' || !xs.length) {
    body = (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }} />
            {series.map((s) => (
              <th key={s.name} style={{ textAlign: 'right' }}>{s.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xs.map((k) => (
            <tr key={k}>
              <td>{k}</td>
              {series.map((s) => (
                <td key={s.name} style={{ textAlign: 'right' }}>{fmt(s.points.find((p) => String(p.x) === k)?.y ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )
  } else if (kind === 'pie') {
    const pts = series[0]?.points ?? []
    const total = pts.reduce((s, p) => s + Math.max(0, p.y), 0) || 1
    let a = -Math.PI / 2
    body = (
      <svg viewBox="0 0 360 200" width="100%" role="img" aria-label={title}>
        {pts.map((p, i) => {
          const frac = Math.max(0, p.y) / total
          const a2 = a + frac * 2 * Math.PI
          const large = frac > 0.5 ? 1 : 0
          const [cx, cy, r] = [100, 100, 85]
          const d =
            frac >= 0.9999
              ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
              : `M ${cx} ${cy} L ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)} Z`
          a = a2
          return <path key={String(p.x)} d={d} fill={COLORS[i % COLORS.length]} />
        })}
        {pts.map((p, i) => (
          <text key={`l${i}`} x={210} y={30 + i * 22} fontSize={12} fill="currentColor">
            <tspan fill={COLORS[i % COLORS.length]}>■ </tspan>
            {String(p.x)}: {fmt(p.y)} ({Math.round((Math.max(0, p.y) / total) * 1000) / 10}%)
          </text>
        ))}
      </svg>
    )
  } else {
    const bw = (iw / Math.max(1, xs.length)) / Math.max(1, series.length) * 0.8
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => {
          const v = min + f * span
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.12} />
              <text x={PAD.l - 6} y={y(v) + 4} fontSize={11} textAnchor="end" fill="currentColor">{fmt(v)}</text>
            </g>
          )
        })}
        {xs.map((k, i) =>
          i % labelEvery === 0 ? (
            <text key={k} x={kind === 'bar' ? PAD.l + (i + 0.5) * (iw / xs.length) : x(i)} y={H - PAD.b + 16} fontSize={10} textAnchor="middle" fill="currentColor">
              {k.length > 14 ? `${k.slice(0, 13)}…` : k}
            </text>
          ) : null,
        )}
        {series.map((s, si) =>
          kind === 'bar' ? (
            s.points.map((p) => {
              const i = xs.indexOf(String(p.x))
              const x0 = PAD.l + i * (iw / xs.length) + (iw / xs.length) * 0.1 + si * bw
              return <rect key={`${s.name}-${p.x}`} x={x0} y={y(Math.max(0, p.y))} width={bw} height={Math.abs(y(p.y) - y(0))} fill={COLORS[si % COLORS.length]} />
            })
          ) : (
            <polyline
              key={s.name}
              fill="none"
              stroke={COLORS[si % COLORS.length]}
              strokeWidth={2}
              strokeDasharray={si > 0 && /band/i.test(s.name) ? '4 4' : undefined}
              points={s.points.map((p) => `${x(xs.indexOf(String(p.x)))},${y(p.y)}`).join(' ')}
            />
          ),
        )}
      </svg>
    )
  }
  return (
    <figure style={{ margin: '12px 0', padding: 12, border: '1px solid var(--theme-elevation-150, #ddd)', borderRadius: 6 }}>
      <figcaption style={{ fontWeight: 600, marginBottom: 6 }}>{title}</figcaption>
      {body}
      {series.length > 1 && kind !== 'table' && (
        <div style={{ fontSize: 12, marginTop: 4 }}>
          {series.map((s, i) => (
            <span key={s.name} style={{ marginRight: 12 }}>
              <span style={{ color: COLORS[i % COLORS.length] }}>■</span> {s.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  )
}
