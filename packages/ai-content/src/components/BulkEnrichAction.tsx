'use client'
import React, { useState } from 'react'
import { Button, toast, useConfig, useLocale, useSelection } from '@payloadcms/ui'
import type { BulkActionProps } from '../extendConfig'
import { ACTION_LABELS, adminBase, errorMessage, getJSON } from './api'

const BULK_ACTIONS = ['write', 'rewrite', 'shorten', 'tone', 'translate', 'seo', 'faq', 'tags', 'attributes']

/** List-view bar: enrich the selected documents in a background job; results go to the review screen. */
export const BulkEnrichAction: React.FC<BulkActionProps> = ({ collection, fields, locales }) => {
  const { config } = useConfig()
  const { selectedIDs, count } = useSelection()
  const locale = useLocale() as { code?: string } | undefined
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState('write')
  const [chosen, setChosen] = useState<string[]>(fields.slice(0, 1).map((f) => f.path))
  const [instructions, setInstructions] = useState('')
  const [tone, setTone] = useState('friendly')
  const [targetLocale, setTargetLocale] = useState(locales?.find((l) => l !== locale?.code) ?? 'bn')
  const [busy, setBusy] = useState(false)

  if (!count) return null

  const start = async () => {
    setBusy(true)
    try {
      const r = await getJSON<{ runId: string; reviewPath: string }>(config, '/ai/content/bulk', {
        body: {
          collection,
          ids: selectedIDs,
          action,
          fields: chosen,
          locale: locale?.code,
          instructions: instructions || undefined,
          tone: action === 'tone' ? tone : undefined,
          targetLocale: action === 'translate' ? targetLocale : undefined,
        },
      })
      toast.success('Bulk enrichment queued — opening review…')
      window.location.assign(`${adminBase(config)}${r.reviewPath}`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ margin: '8px 0', padding: 8, border: '1px dashed var(--theme-elevation-200)', borderRadius: 4 }}>
      <Button size="small" buttonStyle="secondary" onClick={() => setOpen((o) => !o)}>
        ✨ AI enrich {count} selected
      </Button>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12 }}>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            {BULK_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a] ?? a}
              </option>
            ))}
          </select>
          {fields.map((f) => (
            <label key={f.path}>
              <input
                type="checkbox"
                checked={chosen.includes(f.path)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, f.path] : c.filter((p) => p !== f.path)))}
              />{' '}
              {f.path}
            </label>
          ))}
          {action === 'tone' && <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="tone" />}
          {action === 'translate' && (
            <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)}>
              {(locales?.length ? locales : ['en', 'bn']).map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
          <input style={{ flex: 1, minWidth: 160 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions (optional)" />
          <Button size="small" disabled={busy || !chosen.length} onClick={() => void start()}>
            {busy ? 'Queuing…' : 'Start'}
          </Button>
          <span style={{ opacity: 0.7 }}>Results are drafts for review — nothing is published.</span>
        </div>
      )}
    </div>
  )
}

export default BulkEnrichAction
