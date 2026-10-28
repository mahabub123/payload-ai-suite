'use client'
import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useState } from 'react'

/** "Test connection" button on ai-providers documents. Calls POST /api/ai/providers/:id/test. */
export const ProviderTestButton: React.FC = () => {
  const { config } = useConfig()
  const { id } = useDocumentInfo()
  const [state, setState] = useState<{ busy: boolean; msg?: string; ok?: boolean }>({ busy: false })
  if (!id) return null
  const api = `${config.serverURL ?? ''}${config.routes?.api ?? '/api'}`

  const run = async () => {
    setState({ busy: true })
    try {
      const res = await fetch(`${api}/ai/providers/${encodeURIComponent(String(id))}/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`)
      const msg = body.ok ? `Connected. Chat ✓, tools ${body.tools ? '✓' : '✗'}${body.error ? ` (${body.error})` : ''}` : `Failed: ${body.error ?? 'unknown error'}`
      setState({ busy: false, ok: !!body.ok, msg })
    } catch (e) {
      setState({ busy: false, ok: false, msg: (e as Error).message })
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Button buttonStyle="secondary" size="small" disabled={state.busy} onClick={() => void run()}>
        {state.busy ? 'Testing…' : 'Test connection'}
      </Button>
      {state.msg && <p style={{ color: state.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)', margin: '4px 0 0' }}>{state.msg}</p>}
    </div>
  )
}

export default ProviderTestButton
