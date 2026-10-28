'use client'
import { useState } from 'react'
import { Button, toast, useDocumentInfo } from '@payloadcms/ui'
import { SUGGESTED_EVENT, useSuiteApi, type SuggestResponse } from './api'

/** Edit-view control on ai-tickets: ask the AI for a grounded reply + thread summary. */
export const SuggestReplyButton: React.FC = () => {
  const { id } = useDocumentInfo()
  const post = useSuiteApi()
  const [busy, setBusy] = useState(false)
  if (!id) return null
  const suggest = async () => {
    setBusy(true)
    try {
      const out = await post<SuggestResponse>(`/ai/support/tickets/${id}/suggest`, {})
      window.dispatchEvent(new CustomEvent(SUGGESTED_EVENT, { detail: out }))
      toast.success('Suggested reply ready — review it below before sending')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button buttonStyle="secondary" size="small" onClick={suggest} disabled={busy}>
      {busy ? 'Thinking…' : 'Suggest reply'}
    </Button>
  )
}

export default SuggestReplyButton
