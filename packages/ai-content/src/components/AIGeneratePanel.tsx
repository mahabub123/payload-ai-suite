'use client'
import React, { useMemo, useState } from 'react'
import { Button, toast, useConfig, useDocumentInfo, useForm, useLocale } from '@payloadcms/ui'
import type { PanelProps } from '../extendConfig'
import type { ExtractedDraft } from '../types'
import { errorMessage, formContext, getJSON, textToLexical } from './api'

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

const guess = (fields: PanelProps['fields'], re: RegExp, types?: string[]) =>
  fields.find((f) => re.test(f.path) && (!types || types.includes(f.type)))?.path ?? ''

/** "Generate from photo / spec": vision extract → editable review form → fill the chosen fields. */
export const AIGeneratePanel: React.FC<PanelProps> = ({ collection, fields, categoryField }) => {
  const { config } = useConfig()
  const { id } = useDocumentInfo()
  const locale = useLocale() as { code?: string } | undefined
  const { getData, dispatchFields, setModified } = useForm()
  const [imageUrl, setImageUrl] = useState('')
  const [spec, setSpec] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ExtractedDraft | null>(null)
  const [generationId, setGenerationId] = useState<string | undefined>()
  const [descEdited, setDescEdited] = useState(false)
  const [extractedFor, setExtractedFor] = useState('')
  const singles = useMemo(() => fields.filter((f) => !f.hasMany), [fields])
  const descField = guess(singles, /desc/i, ['richText', 'textarea']) || singles.find((f) => f.type !== 'text')?.path || singles[0]?.path || ''
  const [targets, setTargets] = useState({
    title: guess(singles, /(title|name)$/i, ['text']),
    description: descField,
    tags: fields.find((f) => f.hasMany)?.path ?? '',
  })
  const [useCategories, setUseCategories] = useState(true)

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) return setError('Image is larger than 4 MB')
    const reader = new FileReader()
    reader.onload = () => setImageUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  const extract = async () => {
    if (!descField) return setError('No AI-enabled text field on this collection')
    setBusy(true)
    setError(null)
    try {
      const r = await getJSON<{ data: ExtractedDraft; generationId: string }>(config, '/ai/content/generate', {
        body: {
          action: 'extract',
          collection,
          docId: id ?? undefined,
          field: targets.description || descField,
          locale: locale?.code,
          imageUrl: imageUrl || undefined,
          context: { ...formContext(getData() as Record<string, unknown>), ...(spec ? { spec } : {}) },
          stream: false,
        },
      })
      setDraft(r.data)
      setGenerationId(r.generationId)
      setDescEdited(false)
      setExtractedFor(targets.description || descField)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const fill = async (accept: boolean) => {
    if (!draft) return
    try {
      const descType = fields.find((f) => f.path === targets.description)?.type
      let descValue: unknown = descType === 'richText' && draft.description ? textToLexical(draft.description) : draft.description
      if (generationId) {
        const r = await getJSON<{ value?: unknown }>(config, `/ai/content/generations/${generationId}`, { method: 'PATCH', body: { accepted: accept } })
        // The server converts the stored Markdown with the field's editor config; staff edits here win.
        if (!descEdited && targets.description === extractedFor && r.value !== undefined) descValue = r.value
      }
      if (accept) {
        const set = (path: string, value: unknown) => path && value !== undefined && dispatchFields({ type: 'UPDATE', path, value })
        set(targets.title, draft.title)
        set(targets.description, descValue)
        if (targets.tags) set(targets.tags, draft.tags)
        if (categoryField && useCategories && draft.categoryIds.length) {
          const current = (getData() as Record<string, unknown>)[categoryField]
          set(categoryField, Array.isArray(current) || current == null ? draft.categoryIds : draft.categoryIds[0])
        }
        setModified(true)
        toast.success('Fields filled from AI draft — review and save.')
      }
      setDraft(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const select = (key: keyof typeof targets, opts: PanelProps['fields']) => (
    <select value={targets[key]} onChange={(e) => setTargets((t) => ({ ...t, [key]: e.target.value }))} style={{ fontSize: 12 }}>
      <option value="">— skip —</option>
      {opts.map((f) => (
        <option key={f.path} value={f.path}>
          {f.path}
        </option>
      ))}
    </select>
  )

  return (
    <div style={{ marginBottom: 24, padding: 12, border: '1px solid var(--theme-elevation-150)', borderRadius: 4 }}>
      <h4 style={{ margin: '0 0 8px' }}>✨ Generate from photo / spec</h4>
      <input
        style={{ width: '100%', fontSize: 12 }}
        placeholder="Image URL (or choose a file)"
        value={imageUrl.startsWith('data:') ? '(uploaded image)' : imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />
      <input type="file" accept="image/*" style={{ fontSize: 12, marginTop: 4 }} onChange={(e) => onFile(e.target.files?.[0])} />
      <textarea
        style={{ width: '100%', fontSize: 12, marginTop: 6 }}
        rows={4}
        placeholder="Paste a spec sheet (optional)"
        value={spec}
        maxLength={8000}
        onChange={(e) => setSpec(e.target.value)}
      />
      <Button size="small" disabled={busy || (!imageUrl && !spec)} onClick={() => void extract()}>
        {busy ? 'Reading…' : 'Extract draft'}
      </Button>
      {error && <p style={{ color: 'var(--theme-error-500)', fontSize: 12 }}>{error}</p>}
      {draft && (
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <label>
            Title → {select('title', singles)}
            <input style={{ width: '100%' }} value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label>
            Description → {select('description', singles)}
            <textarea
              style={{ width: '100%' }}
              rows={6}
              value={draft.description ?? ''}
              onChange={(e) => {
                setDescEdited(true)
                setDraft({ ...draft, description: e.target.value })
              }}
            />
          </label>
          {Object.keys(draft.attributes).length > 0 && (
            <div>
              <strong>Attributes</strong>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {Object.entries(draft.attributes).map(([k, v]) => (
                  <li key={k}>
                    {k}: {Array.isArray(v) ? v.join(', ') : String(v)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fields.some((f) => f.hasMany) && (
            <label>
              Tags → {select('tags', fields.filter((f) => f.hasMany))} <span>{draft.tags.join(', ')}</span>
            </label>
          )}
          {categoryField && (
            <label style={{ display: 'block' }}>
              <input type="checkbox" checked={useCategories} onChange={(e) => setUseCategories(e.target.checked)} /> Categories →{' '}
              {categoryField}: {draft.categories.map((c) => c.title).join(', ') || 'none matched'}
            </label>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Button size="small" onClick={() => void fill(true)}>
              Fill fields
            </Button>
            <Button size="small" buttonStyle="subtle" onClick={() => void fill(false)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AIGeneratePanel
