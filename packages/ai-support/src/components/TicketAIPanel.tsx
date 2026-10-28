'use client'
import { useEffect, useState } from 'react'
import { Button, toast, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { SUGGESTED_EVENT, useSuiteApi, type SuggestResponse } from './api'

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, marginBottom: 16 }

/** UI field on ai-tickets: AI summary, editable suggested reply and Send. */
export const TicketAIPanel: React.FC = () => {
  const { id } = useDocumentInfo()
  const post = useSuiteApi()
  const summaryField = useFormFields(([fields]) => fields.summary?.value as string | undefined)
  const suggestedField = useFormFields(([fields]) => fields.suggestedReply?.value as string | undefined)
  const [summary, setSummary] = useState(summaryField ?? '')
  const [draft, setDraft] = useState(suggestedField ?? '')
  const [citations, setCitations] = useState<SuggestResponse['citations']>([])
  const [status, setStatus] = useState<'pending' | 'solved'>('pending')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onSuggested = (e: Event) => {
      const d = (e as CustomEvent<SuggestResponse>).detail
      setSummary(d.summary)
      setDraft(d.suggestedReply)
      setCitations(d.citations ?? [])
    }
    window.addEventListener(SUGGESTED_EVENT, onSuggested)
    return () => window.removeEventListener(SUGGESTED_EVENT, onSuggested)
  }, [])

  if (!id) return null
  const send = async () => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await post(`/ai/support/tickets/${id}/reply`, { body: draft, status })
      toast.success('Reply sent')
      window.location.reload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={box}>
      <h4 style={{ marginTop: 0 }}>AI assist</h4>
      {summary ? <p><strong>Summary:</strong> {summary}</p> : <p>No summary yet — use “Suggest reply”.</p>}
      <label htmlFor="ai-support-reply" style={{ display: 'block', fontWeight: 600 }}>
        Reply (edit before sending)
      </label>
      <textarea id="ai-support-reply" rows={8} style={{ width: '100%' }} value={draft} onChange={(e) => setDraft(e.target.value)} />
      {citations.length > 0 && (
        <p style={{ fontSize: 12 }}>
          Sources:{' '}
          {citations.map((c, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title}
            </span>
          ))}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as 'pending' | 'solved')} aria-label="Status after sending">
          <option value="pending">Send &amp; mark pending</option>
          <option value="solved">Send &amp; mark solved</option>
        </select>
        <Button buttonStyle="primary" size="small" onClick={send} disabled={busy || !draft.trim()}>
          Send reply
        </Button>
      </div>
    </div>
  )
}

export default TicketAIPanel
