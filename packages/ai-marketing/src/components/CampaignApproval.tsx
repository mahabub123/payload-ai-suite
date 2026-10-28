'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button, toast, useConfig, useDocumentInfo } from '@payloadcms/ui'

interface Step {
  subjectVariants?: { subject: string }[]
  chosenSubject?: string | null
  html?: string | null
}

interface Campaign {
  id: string | number
  name: string
  status: string
  steps?: Step[]
  approvedBy?: string | null
  approvedAt?: string | null
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, marginBottom: 12 }

/** Edit-view control on ai-campaigns: subject-variant picker, email preview and the approve button. */
export const CampaignApproval: React.FC = () => {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<(string | null)[]>([])
  const [previewStep, setPreviewStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const res = await fetch(`${api}/ai-campaigns/${id}?depth=0`, { credentials: 'include' })
    if (!res.ok) return
    const c = (await res.json()) as Campaign
    setCampaign(c)
    setChosen((c.steps ?? []).map((s) => s.chosenSubject ?? s.subjectVariants?.[0]?.subject ?? null))
  }, [api, id])

  useEffect(() => {
    void load()
  }, [load])

  if (!id || !campaign) return null
  const approvable = ['draft', 'pending-approval', 'paused'].includes(campaign.status)

  const post = async (path: string, body: unknown) => {
    setBusy(true)
    try {
      const res = await fetch(`${api}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as { message?: string; details?: unknown }
      if (!res.ok) {
        const details = Array.isArray(json.details)
          ? `: ${json.details.map((d) => (typeof d === 'string' ? d : (d as { message?: string }).message ?? '')).join(', ')}`
          : ''
        toast.error(`${json.message ?? 'Request failed'}${details}`)
        return false
      }
      return true
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    const ok = await post(`/ai/marketing/campaigns/${id}/approve`, {
      chosenSubjects: chosen,
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
    })
    if (ok) {
      toast.success('Campaign approved')
      setOpen(false)
      await load()
      window.location.reload()
    }
  }

  const pause = async (paused: boolean) => {
    if (await post(`/ai/marketing/campaigns/${id}/pause`, { paused })) {
      toast.success(paused ? 'Campaign paused' : 'Campaign needs approval again')
      window.location.reload()
    }
  }

  const steps = campaign.steps ?? []
  const html = steps[previewStep]?.html ?? ''

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {approvable && (
        <Button buttonStyle="primary" size="small" onClick={() => setOpen((v) => !v)} disabled={busy}>
          Review &amp; approve
        </Button>
      )}
      {['approved', 'scheduled', 'sending'].includes(campaign.status) && (
        <Button buttonStyle="secondary" size="small" onClick={() => pause(true)} disabled={busy}>
          Pause
        </Button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label="Approve campaign"
          style={{ position: 'fixed', inset: '5% 10%', zIndex: 100, overflow: 'auto', background: 'var(--theme-bg)', ...box, padding: 24 }}
        >
          <h3>Approve “{campaign.name}”</h3>
          <p>Approving schedules the send. Every email includes an unsubscribe link; opted-out customers are skipped.</p>
          {steps.map((s, i) => (
            <fieldset key={i} style={box}>
              <legend>Step {i + 1} subject</legend>
              {(s.subjectVariants ?? []).map((v) => (
                <label key={v.subject} style={{ display: 'block' }}>
                  <input
                    type="radio"
                    name={`subject-${i}`}
                    checked={chosen[i] === v.subject}
                    onChange={() => setChosen((c) => c.map((x, j) => (j === i ? v.subject : x)))}
                  />{' '}
                  {v.subject}
                </label>
              ))}
              <Button buttonStyle="secondary" size="small" onClick={() => setPreviewStep(i)}>
                Preview step {i + 1}
              </Button>
            </fieldset>
          ))}
          <div style={box}>
            <strong>Preview — step {previewStep + 1}</strong>
            <iframe title="Email preview" sandbox="" srcDoc={html} style={{ width: '100%', height: 360, border: 0, background: '#fff' }} />
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}>
            Schedule (optional){' '}
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button buttonStyle="primary" onClick={approve} disabled={busy}>
              Approve
            </Button>
            <Button buttonStyle="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CampaignApproval
