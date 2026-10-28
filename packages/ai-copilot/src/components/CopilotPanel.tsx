'use client'
import React, { useRef, useState } from 'react'
import type { Card } from 'payload-ai-core/wire'
import { DiffViewer } from './DiffViewer'
import { postSSE } from './sse'

interface Msg {
  role: 'user' | 'assistant'
  text: string
  cards: Card[]
  tools: string[]
  error?: string
}

const pageFromLocation = (): { collection?: string; id?: string; url?: string } => {
  if (typeof window === 'undefined') return {}
  const m = window.location.pathname.match(/\/collections\/([^/]+)(?:\/([^/]+))?/)
  return { collection: m?.[1], id: m?.[2] && m[2] !== 'create' ? m[2] : undefined, url: window.location.pathname }
}

const CardView: React.FC<{ card: Card; apiRoute: string }> = ({ card, apiRoute }) => {
  if (card.type === 'action-result' && card.actionId.startsWith('changeset:')) {
    return (
      <div>
        <div style={{ fontSize: 12 }}>{card.message}</div>
        <DiffViewer changesetId={card.actionId.slice('changeset:'.length)} apiRoute={apiRoute} />
      </div>
    )
  }
  if (card.type === 'citations') {
    return (
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        Sources:{' '}
        {card.citations.map((c, i) => (
          <span key={i}>
            {c.url ? (
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.title}
              </a>
            ) : (
              c.title
            )}
            {i < card.citations.length - 1 ? ', ' : ''}
          </span>
        ))}
      </div>
    )
  }
  return null
}

/** Staff copilot chat: streams /api/ai/copilot/chat and renders bulk-edit diffs with Apply/Discard. */
export const CopilotPanel: React.FC<{ apiRoute?: string; onClose?: () => void }> = ({ apiRoute = '/api', onClose }) => {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationId = useRef<string | undefined>(undefined)

  const patchLast = (fn: (m: Msg) => Msg) => setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])])

  const send = async () => {
    const message = input.trim()
    if (!message || busy) return
    setInput('')
    setBusy(true)
    setMessages((ms) => [...ms, { role: 'user', text: message, cards: [], tools: [] }, { role: 'assistant', text: '', cards: [], tools: [] }])
    try {
      for await (const ev of postSSE(`${apiRoute}/ai/copilot/chat`, { message, conversationId: conversationId.current, page: pageFromLocation() })) {
        if (ev.type === 'meta') conversationId.current = ev.conversationId ?? conversationId.current
        else if (ev.type === 'text') patchLast((m) => ({ ...m, text: m.text + ev.delta }))
        else if (ev.type === 'card') patchLast((m) => ({ ...m, cards: [...m.cards, ev.card] }))
        else if (ev.type === 'tool' && ev.status === 'started') patchLast((m) => ({ ...m, tools: [...m.tools, ev.name] }))
        else if (ev.type === 'error') patchLast((m) => ({ ...m, error: ev.message }))
      }
    } catch (e) {
      patchLast((m) => ({ ...m, error: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--theme-elevation-0)', color: 'var(--theme-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--theme-elevation-150)' }}>
        <strong>AI Copilot</strong>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close copilot">
            ×
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Ask me to find, summarize or draft — e.g. “find draft posts older than 30 days” or “set the category of all red shirts to Summer”. Edits are
            proposed as a diff for you to apply.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'stretch', maxWidth: m.role === 'user' ? '85%' : '100%' }}>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                padding: m.role === 'user' ? '6px 10px' : 0,
                borderRadius: 6,
                background: m.role === 'user' ? 'var(--theme-elevation-100)' : 'transparent',
              }}
            >
              {m.text || (m.role === 'assistant' && busy && i === messages.length - 1 ? '…' : '')}
            </div>
            {m.tools.length > 0 && <div style={{ fontSize: 11, opacity: 0.6 }}>used: {m.tools.join(', ')}</div>}
            {m.cards.map((c, j) => (
              <CardView key={j} card={c} apiRoute={apiRoute} />
            ))}
            {m.error && <div style={{ color: 'var(--theme-error-500)', fontSize: 12 }}>{m.error}</div>}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid var(--theme-elevation-150)' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
          placeholder="Ask the copilot…"
          style={{ flex: 1, resize: 'none' }}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
