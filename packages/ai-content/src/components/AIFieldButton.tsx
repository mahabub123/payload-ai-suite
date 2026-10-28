'use client'
import React, { useCallback, useRef, useState } from 'react'
import { Button, toast, useConfig, useDocumentInfo, useField, useForm, useLocale } from '@payloadcms/ui'
import type { FieldButtonProps } from '../extendConfig'
import { ACTION_LABELS, appendLexical, callApi, errorMessage, formContext, getJSON, isStream, readSSE } from './api'

interface Preview {
  text: string
  generationId?: string
  value?: unknown
  data?: unknown
  streaming: boolean
}

const box: React.CSSProperties = {
  marginTop: 8,
  padding: 12,
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 4,
  background: 'var(--theme-elevation-50)',
}

/** "AI" menu next to a text / textarea / rich text field: generate, preview, then Insert / Replace / Discard. */
export const AIFieldButton: React.FC<FieldButtonProps> = ({ collection, field, fieldType, hasMany, actions, locales }) => {
  const { config } = useConfig()
  const { id } = useDocumentInfo()
  const locale = useLocale() as { code?: string } | undefined
  const { getData } = useForm()
  const { value, setValue } = useField<unknown>({ path: field })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [instructions, setInstructions] = useState('')
  const [tone, setTone] = useState('friendly')
  const [targetLocale, setTargetLocale] = useState(locales?.find((l) => l !== locale?.code) ?? 'bn')
  const abort = useRef(false)

  const run = useCallback(
    async (action: string) => {
      setBusy(true)
      setError(null)
      setPreview(null)
      abort.current = false
      try {
        const res = await callApi(config, '/ai/content/generate', {
          body: {
            action,
            collection,
            docId: id ?? undefined,
            field,
            locale: locale?.code,
            instructions: instructions || undefined,
            tone: action === 'tone' ? tone : undefined,
            targetLocale: action === 'translate' ? targetLocale : undefined,
            context: formContext(getData() as Record<string, unknown>),
            currentValue: value ?? undefined,
          },
        })
        if (isStream(res)) {
          let text = ''
          setPreview({ text, streaming: true })
          for await (const ev of readSSE(res)) {
            if (abort.current) break
            if (ev.type === 'text') {
              text += String((ev as { delta: string }).delta)
              setPreview({ text, streaming: true })
            } else if (ev.type === 'done') {
              setPreview({ text, generationId: (ev as { messageId?: string }).messageId, streaming: false })
            } else if (ev.type === 'error') {
              throw new Error(String((ev as { message: string }).message))
            }
          }
        } else {
          const r = (await res.json()) as { output: string; generationId: string; value?: unknown; data?: unknown }
          setPreview({ text: r.output, generationId: r.generationId, value: r.value, data: r.data, streaming: false })
        }
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setBusy(false)
      }
    },
    [config, collection, id, field, locale?.code, instructions, tone, targetLocale, getData, value],
  )

  const decide = useCallback(
    async (mode: 'insert' | 'replace' | 'discard') => {
      if (!preview) return
      try {
        let fieldValue = preview.value
        if (preview.generationId) {
          const r = await getJSON<{ value?: unknown }>(config, `/ai/content/generations/${preview.generationId}`, {
            method: 'PATCH',
            body: { accepted: mode !== 'discard' },
          })
          fieldValue = r.value ?? fieldValue
        }
        if (mode !== 'discard') {
          const v = fieldValue ?? preview.text
          if (mode === 'replace') setValue(v)
          else if (fieldType === 'richText') setValue(appendLexical(value, v))
          else if (hasMany) setValue([...new Set([...(Array.isArray(value) ? value : []), ...(Array.isArray(v) ? v : [v])])])
          else setValue(value ? `${String(value)}${fieldType === 'text' ? ' ' : '\n\n'}${String(v)}` : v)
          toast.success(mode === 'replace' ? 'AI text applied — review and save.' : 'AI text inserted — review and save.')
        }
        setPreview(null)
        setOpen(false)
      } catch (e) {
        setError(errorMessage(e))
      }
    },
    [preview, config, fieldType, hasMany, value, setValue],
  )

  const list = actions ?? ['write', 'rewrite', 'shorten', 'tone', 'translate', 'seo', 'faq']

  return (
    <div className="ai-field-button" style={{ marginTop: 4 }}>
      <Button buttonStyle="subtle" size="small" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ✨ AI
      </Button>
      {open && (
        <div style={box}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {list.map((a) => (
              <Button key={a} buttonStyle="secondary" size="small" disabled={busy} onClick={() => void run(a)}>
                {ACTION_LABELS[a] ?? a}
              </Button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {list.includes('tone') && (
              <label style={{ fontSize: 12 }}>
                Tone{' '}
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  {['friendly', 'premium', 'playful', 'professional', 'concise', 'warm'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            {list.includes('translate') && (
              <label style={{ fontSize: 12 }}>
                Translate to{' '}
                <select value={targetLocale} onChange={(e) => setTargetLocale(e.target.value)}>
                  {(locales?.length ? locales : ['en', 'bn']).map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
            )}
            <input
              style={{ flex: 1, minWidth: 180, fontSize: 12 }}
              placeholder="Extra instructions (optional)"
              value={instructions}
              maxLength={2000}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          {busy && !preview && <p style={{ fontSize: 12 }}>Generating…</p>}
          {error && <p style={{ color: 'var(--theme-error-500)', fontSize: 12 }}>{error}</p>}
          {preview && (
            <div style={{ marginTop: 8 }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, maxHeight: 280, overflow: 'auto', padding: 8, background: 'var(--theme-bg)' }}>
                {preview.text || '…'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button size="small" disabled={preview.streaming} onClick={() => void decide('insert')}>
                  Insert
                </Button>
                <Button size="small" buttonStyle="secondary" disabled={preview.streaming} onClick={() => void decide('replace')}>
                  Replace
                </Button>
                <Button
                  size="small"
                  buttonStyle="subtle"
                  onClick={() => {
                    abort.current = true
                    void decide('discard')
                  }}
                >
                  Discard
                </Button>
              </div>
              <p style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>AI-generated — check facts before saving. Nothing is published automatically.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AIFieldButton
