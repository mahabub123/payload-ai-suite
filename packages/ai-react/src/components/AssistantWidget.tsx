'use client'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Card, ChatRequestBody, Slot } from '@payload-ai-suite/ai-core/wire'
import { actionResultFor } from '../chatReducer'
import type { ChatUIMessage } from '../chatReducer'
import { formatDateTime } from '../format'
import { useAssistantChat } from '../hooks/useAssistantChat'
import type { AssistantChat } from '../hooks/useAssistantChat'
import { renderMarkdown } from '../markdown'
import { useAISuite } from '../provider'
import { CardView } from './cards'
import type { CardHandlers } from './cards'
import { labelsFor } from './labels'
import type { Labels } from './labels'
import { AISuiteStyles } from './styles'

export interface AssistantWidgetProps {
  /** Page context (current product / cart). */
  page?: ChatRequestBody['page']
  greeting?: string
  defaultOpen?: boolean
  labels?: Partial<Labels>
  className?: string
  /** Where the "Log in" link of the verify card points. */
  loginUrl?: string
  /** Include the default stylesheet. Default true. */
  defaultStyles?: boolean
  /** Custom renderer; return undefined to fall back to the default card. */
  renderCard?: (card: Card, chat: AssistantChat) => ReactNode | undefined
  /** Render only the panel, without the floating launcher (embed in your own layout). */
  inline?: boolean
}

export const MessageBubble = ({
  message,
  chat,
  handlers,
  labels,
  renderCard,
}: {
  message: ChatUIMessage
  chat: AssistantChat
  handlers: CardHandlers
  labels: Labels
  renderCard?: AssistantWidgetProps['renderCard']
}) => {
  const cards = message.cards.filter((c) => c.type !== 'action-result' || !message.cards.some((x) => x.type === 'confirmation' && x.actionId === c.actionId)) // results render under their confirmation
  return (
    <div className={`ais-msg ais-msg-${message.role}${message.status === 'error' ? ' ais-msg-error' : ''}`}>
      {message.role === 'assistant' ? (
        message.text ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} /> : null
      ) : (
        <div>{message.text}</div>
      )}
      {message.activeTool ? <div className="ais-status">{labels.thinking}</div> : null}
      {cards.length ? (
        <div className="ais-cards">
          {cards.map((card, i) => {
            const custom = renderCard?.(card, chat)
            const result = card.type === 'confirmation' ? actionResultFor(message, card.actionId) : undefined
            return (
              <div key={i}>
                {custom ?? <CardView card={card} {...handlers} />}
                {result ? <CardView card={result} {...handlers} /> : null}
              </div>
            )
          })}
        </div>
      ) : null}
      {message.role === 'assistant' && message.status === 'done' && message.serverId ? (
        <div className="ais-feedback">
          <button type="button" aria-label={labels.helpful} aria-pressed={message.feedback === 'up'} onClick={() => chat.feedback(message.id, 'up')}>
            👍
          </button>
          <button type="button" aria-label={labels.notHelpful} aria-pressed={message.feedback === 'down'} onClick={() => chat.feedback(message.id, 'down')}>
            👎
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Floating storefront assistant: launcher, AI notice, streaming message list, cards, composer. */
export const AssistantWidget = ({
  page,
  greeting,
  defaultOpen = false,
  labels: labelOverrides,
  className,
  loginUrl,
  defaultStyles = true,
  renderCard,
  inline = false,
}: AssistantWidgetProps) => {
  const client = useAISuite()
  const locale = client.config.locale
  const labels = labelsFor(locale, labelOverrides)
  const chat = useAssistantChat({ page })
  const [open, setOpen] = useState(defaultOpen || inline)
  const [draft, setDraft] = useState('')
  const panelId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const close = useCallback(() => {
    setOpen(false)
    launcherRef.current?.focus()
  }, [])

  const submit = () => {
    if (!draft.trim() || chat.streaming) return
    void chat.send(draft)
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const handlers: CardHandlers = {
    locale,
    labels,
    loginUrl,
    onConfirm: chat.confirmAction,
    onReject: chat.rejectAction,
    onSelectSlot: (_offeringId: string, slot: Slot) => void chat.send(`${labels.pickSlot}: ${formatDateTime(slot.start, locale)} (${slot.start})`),
    verify: chat.verify,
  }

  return (
    <div className={`ais-root${className ? ` ${className}` : ''}`}>
      {defaultStyles ? <AISuiteStyles /> : null}
      {!inline ? (
        <button
          ref={launcherRef}
          type="button"
          className="ais-launcher"
          aria-label={open ? labels.close : labels.open}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? '×' : '💬'}
        </button>
      ) : null}
      {open ? (
        <section
          id={panelId}
          className="ais-panel"
          style={inline ? { position: 'static', width: '100%', height: '100%' } : undefined}
          role={inline ? 'region' : 'dialog'}
          aria-label={labels.title}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !inline) close()
          }}
        >
          <header className="ais-header">
            <h2>{labels.title}</h2>
            {chat.messages.length ? (
              <button type="button" className="ais-btn" onClick={chat.reset}>
                {labels.newChat}
              </button>
            ) : null}
            {!inline ? (
              <button type="button" className="ais-btn" aria-label={labels.close} onClick={close}>
                ×
              </button>
            ) : null}
          </header>
          {chat.aiNotice ? <div className="ais-notice">{labels.aiNotice}</div> : null}
          <div ref={logRef} className="ais-log" role="log" aria-live="polite" aria-relevant="additions" aria-busy={chat.streaming /* announce replies once complete, not token by token */}>
            {greeting && !chat.messages.length ? <div className="ais-msg ais-msg-assistant">{greeting}</div> : null}
            {chat.messages.map((m) => (
              <MessageBubble key={m.id} message={m} chat={chat} handlers={handlers} labels={labels} renderCard={renderCard} />
            ))}
            {chat.error ? (
              <div className="ais-status" role="alert">
                {chat.error.message}
              </div>
            ) : null}
          </div>
          <form
            className="ais-form"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <label className="ais-sr" htmlFor={`${panelId}-input`}>
              {labels.placeholder}
            </label>
            <textarea
              id={`${panelId}-input`}
              ref={inputRef}
              className="ais-input"
              rows={1}
              maxLength={4000}
              placeholder={labels.placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {chat.streaming ? (
              <button type="button" className="ais-btn" onClick={chat.stop}>
                {labels.stop}
              </button>
            ) : (
              <button type="submit" className="ais-btn ais-btn-primary" disabled={!draft.trim()}>
                {labels.send}
              </button>
            )}
          </form>
        </section>
      ) : null}
    </div>
  )
}
