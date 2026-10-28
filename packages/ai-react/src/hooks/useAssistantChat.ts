'use client'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ActionStatus, Card, ChatRequestBody, StreamWireEvent } from '@payload-ai-suite/ai-core/wire'
import { AISuiteRequestError, randomId, storage } from '../client'
import { chatReducer, initialChatState } from '../chatReducer'
import type { ChatUIMessage } from '../chatReducer'
import { useAISuite } from '../provider'
import { readWireEvents } from '../sse'
import { getTurnstileToken } from '../turnstile'

export interface UseAssistantChatOptions {
  /** localStorage key for the conversation id. */
  storageKey?: string
  /** Page context sent with every message (current product, cart, url). */
  page?: ChatRequestBody['page']
  /** Restore the stored conversation on mount. Default true. */
  resume?: boolean
}

export type VerifyStatus = 'idle' | 'sending' | 'code-sent' | 'confirming' | 'verified' | 'error'

interface StoredMsg {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  cards?: Card[]
}

const ACTION_MESSAGES: Record<ActionStatus, string> = {
  proposed: 'Waiting for confirmation.',
  confirmed: 'Confirmed.',
  done: 'Done — your request was submitted.',
  rejected: 'Cancelled.',
  failed: 'Sorry, that did not work. Please try again or contact us.',
  expired: 'This request expired. Please ask again.',
}

export const useAssistantChat = (opts: UseAssistantChatOptions = {}) => {
  const client = useAISuite()
  const key = opts.storageKey ?? 'ai-suite:assistant:conversation'
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [verify, setVerify] = useState<{ status: VerifyStatus; message?: string }>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)
  const idemKeys = useRef(new Map<string, string>())
  const stateRef = useRef(state)
  stateRef.current = state
  const pageRef = useRef(opts.page)
  pageRef.current = opts.page

  const setConversation = useCallback(
    (id?: string) => {
      storage.set(key, id ?? null)
      dispatch({ type: 'conversation', conversationId: id })
    },
    [key],
  )

  // Resume the stored conversation (owner-only endpoint; forbidden/not found -> start fresh).
  useEffect(() => {
    if (opts.resume === false) return
    const id = storage.get(key)
    if (!id) return
    let cancelled = false
    client
      .json<{ conversationId: string; handedOff?: boolean; messages: StoredMsg[] }>(`/assistant/conversations/${encodeURIComponent(id)}`)
      .then((r) => {
        if (cancelled) return
        const messages: ChatUIMessage[] = r.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ id: m.id, serverId: m.id, role: m.role as 'user' | 'assistant', text: m.text, cards: m.cards ?? [], status: 'done' }))
        dispatch({ type: 'load', conversationId: r.conversationId, messages, handedOff: r.handedOff })
      })
      .catch((e: unknown) => {
        if (!cancelled && e instanceof AISuiteRequestError && (e.status === 403 || e.status === 404)) storage.set(key, null)
      })
    return () => {
      cancelled = true
    }
  }, [client, key, opts.resume])

  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string, extra: { page?: ChatRequestBody['page'] } = {}) => {
      const message = text.trim()
      if (!message || stateRef.current.streaming) return
      const assistantId = randomId()
      dispatch({ type: 'send', id: randomId(), assistantId, text: message })
      const ac = new AbortController()
      abortRef.current = ac
      const conversationId = stateRef.current.conversationId
      try {
        const body: ChatRequestBody = { conversationId, message, page: extra.page ?? pageRef.current, locale: client.config.locale }
        if (!conversationId && client.config.turnstileSiteKey) body.turnstileToken = await getTurnstileToken(client.config.turnstileSiteKey)
        const res = await client.fetch('/assistant/chat', {
          method: 'POST',
          json: body,
          headers: { Accept: 'text/event-stream' },
          signal: ac.signal,
        })
        if (!res.body) throw new AISuiteRequestError(500, { code: 'unknown', message: 'Empty response' })
        let ended = false
        for await (const ev of readWireEvents(res.body, ac.signal)) {
          if (ev.type === 'meta' && ev.conversationId && ev.conversationId !== conversationId) storage.set(key, ev.conversationId)
          if (ev.type === 'error' && (ev.code === 'forbidden' || ev.code === 'not_found')) setConversation(undefined)
          if (ev.type === 'done' || ev.type === 'error') ended = true
          dispatch({ type: 'event', assistantId, event: ev as StreamWireEvent })
        }
        if (!ended) dispatch({ type: 'stop', assistantId })
      } catch (e) {
        if (ac.signal.aborted) return dispatch({ type: 'stop', assistantId })
        const err = e instanceof AISuiteRequestError ? e : null
        if (err && (err.code === 'forbidden' || err.code === 'not_found')) setConversation(undefined)
        dispatch({
          type: 'fail',
          assistantId,
          code: err?.code ?? 'network',
          message: err?.message ?? 'Connection problem. Please try again.',
        })
      } finally {
        if (abortRef.current === ac) abortRef.current = null
      }
    },
    [client, key, setConversation],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const confirmAction = useCallback(
    async (actionId: string) => {
      let idem = idemKeys.current.get(actionId)
      if (!idem) idemKeys.current.set(actionId, (idem = randomId()))
      try {
        const r = await client.json<{ status: ActionStatus; result?: { message?: string } }>(`/actions/${encodeURIComponent(actionId)}/confirm`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idem },
          json: {},
        })
        dispatch({ type: 'action-result', actionId, status: r.status, message: r.result?.message ?? ACTION_MESSAGES[r.status] })
        return r.status
      } catch (e) {
        const status: ActionStatus = e instanceof AISuiteRequestError && e.code === 'conflict' ? 'expired' : 'failed'
        dispatch({ type: 'action-result', actionId, status, message: ACTION_MESSAGES[status] })
        return status
      }
    },
    [client],
  )

  const rejectAction = useCallback(
    async (actionId: string) => {
      try {
        await client.fetch(`/actions/${encodeURIComponent(actionId)}/reject`, { method: 'POST', json: {} })
      } catch {
        // The proposal expires anyway; reflect the shopper's choice locally.
      }
      dispatch({ type: 'action-result', actionId, status: 'rejected', message: ACTION_MESSAGES.rejected })
    },
    [client],
  )

  const feedback = useCallback(
    async (id: string, rating: 'up' | 'down', comment?: string) => {
      const m = stateRef.current.messages.find((x) => x.id === id)
      if (!m?.serverId) return
      dispatch({ type: 'feedback', id, rating })
      await client.fetch('/assistant/feedback', { method: 'POST', json: { messageId: m.serverId, rating, comment } }).catch(() => undefined)
    },
    [client],
  )

  const startVerification = useCallback(
    async (input: { orderNumber: string; email: string }) => {
      setVerify({ status: 'sending' })
      try {
        const r = await client.json<{ conversationId: string; message: string }>('/assistant/verify/start', {
          method: 'POST',
          json: { ...input, conversationId: stateRef.current.conversationId },
        })
        if (r.conversationId !== stateRef.current.conversationId) setConversation(r.conversationId)
        setVerify({ status: 'code-sent', message: r.message })
      } catch (e) {
        setVerify({ status: 'error', message: e instanceof Error ? e.message : 'Could not start verification.' })
      }
    },
    [client, setConversation],
  )

  const confirmVerification = useCallback(
    async (code: string) => {
      const conversationId = stateRef.current.conversationId
      if (!conversationId) return setVerify({ status: 'error', message: 'Please enter your order number and email first.' })
      setVerify({ status: 'confirming' })
      try {
        await client.json('/assistant/verify/confirm', { method: 'POST', json: { code, conversationId } })
        setVerify({ status: 'verified', message: 'Verified.' })
      } catch (e) {
        setVerify({ status: 'code-sent', message: e instanceof Error ? e.message : 'The code is invalid or has expired.' })
        return
      }
      // Answer the question that needed verification, so the shopper doesn't have to ask again.
      const lastQuestion = [...stateRef.current.messages].reverse().find((m) => m.role === 'user')?.text
      if (lastQuestion) await send(lastQuestion)
    },
    [client, send],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    storage.set(key, null)
    dispatch({ type: 'reset' })
    setVerify({ status: 'idle' })
  }, [key])

  return {
    ...state,
    send,
    stop,
    confirmAction,
    rejectAction,
    feedback,
    reset,
    verify: { ...verify, start: startVerification, confirm: confirmVerification },
  }
}

export type AssistantChat = ReturnType<typeof useAssistantChat>
