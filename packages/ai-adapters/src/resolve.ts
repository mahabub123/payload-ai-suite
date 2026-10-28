/**
 * Merge preset defaults with site overrides (config time), then resolve them against payload.config
 * (init time): pick existing collections, check every field path, build Targets and validation results.
 */
import type { AdapterValidationResult, ConceptName } from '@payload-ai-suite/ai-core'
import { CONCEPTS } from '@payload-ai-suite/ai-core'
import type { Where } from 'payload'
import type { PublishedRule, Target } from './local'
import type { CollectionLike, ConfigLike } from './mapping/schema'
import { fieldPathsByType, getCollection, hasDrafts, hasFieldPath, localeInfo } from './mapping/schema'
import type { Candidates, PresetConcept } from './presets'
import { KNOWLEDGE_FIELD_DEFAULTS, KNOWLEDGE_URLS, PRESETS } from './presets'
import type { AdaptersOptions, ConceptOverrides, PublishedCheck } from './types'

const list = (c: Candidates | undefined | null): string[] => (c == null ? [] : Array.isArray(c) ? c : [c])

/** Nested option objects merged one level deep (with their own `fields`). */
const NESTED = new Set(['variants', 'returns', 'services', 'staff', 'locations'])

export interface MergedConcept {
  concept: ConceptName
  candidates: string[]
  explicitCollection: boolean
  /** Logical field -> candidate paths. */
  fields: Record<string, string[]>
  /** Field keys set by the site (must resolve). */
  explicitFields: Set<string>
  required: string[]
  options: Record<string, unknown>
  /** Paths inside nested options that the site set explicitly, e.g. 'variants.collection'. */
  explicitNested: Set<string>
}

type Loose = Record<string, unknown>
const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

const mergeOne = (concept: ConceptName, preset: PresetConcept | undefined, override: Loose | undefined): MergedConcept | null => {
  if (!preset && !override) return null
  const { collection: pCol, fields: pFields, required, ...pOpts } = preset ?? ({ collection: [] } as PresetConcept)
  const { collection: oCol, fields: oFields, ...oOpts } = override ?? {}
  const fields: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(pFields ?? {})) fields[k] = list(v)
  const explicitFields = new Set<string>()
  for (const [k, v] of Object.entries((oFields as Loose) ?? {})) {
    if (v === null) delete fields[k]
    else if (typeof v === 'string') {
      fields[k] = [v]
      explicitFields.add(k)
    } else if (Array.isArray(v) && concept === 'knowledge') fields[k] = v as string[]
  }
  const options: Loose = { ...pOpts }
  const explicitNested = new Set<string>()
  for (const [k, v] of Object.entries(oOpts)) {
    if (NESTED.has(k) && isObj(v) && isObj(options[k])) {
      const base = options[k] as Loose
      options[k] = { ...base, ...v, fields: { ...(base.fields as Loose), ...(v.fields as Loose) } }
    } else options[k] = v
    if (NESTED.has(k) && isObj(v)) {
      for (const nk of Object.keys(v)) explicitNested.add(`${k}.${nk}`)
      for (const fk of Object.keys((v.fields as Loose) ?? {})) explicitNested.add(`${k}.fields.${fk}`)
    }
  }
  if (concept === 'knowledge' && override && 'collections' in override) explicitNested.add('collections')
  return {
    concept,
    candidates: oCol ? [String(oCol)] : list(pCol),
    explicitCollection: !!oCol,
    fields,
    explicitFields,
    required: required ?? [],
    options,
    explicitNested,
  }
}

export const mergeOptions = (opts: AdaptersOptions): Partial<Record<ConceptName, MergedConcept>> => {
  const preset = PRESETS[opts.preset] ?? {}
  const out: Partial<Record<ConceptName, MergedConcept>> = {}
  const combined: ConceptOverrides = {}
  for (const c of CONCEPTS) {
    const a = opts.custom?.[c]
    const b = opts.overrides?.[c]
    if (a === false || b === false) {
      combined[c] = false as never
      continue
    }
    if (a || b) combined[c] = { ...(a as Loose), ...(b as Loose), fields: { ...(a as Loose)?.fields as Loose, ...(b as Loose)?.fields as Loose } } as never
  }
  for (const c of CONCEPTS) {
    if (combined[c] === false) continue
    const m = mergeOne(c, preset[c], combined[c] as Loose | undefined)
    if (m) out[c] = m
  }
  return out
}

/* ---------- resolution against payload.config ---------- */

export interface ResolveEnv {
  config: ConfigLike
  tenantField: string
  serverURL?: string
  locales: string[]
  defaultLocale?: string
}

export const makeEnv = (config: ConfigLike, opts: AdaptersOptions): ResolveEnv => {
  const { locales, defaultLocale } = localeInfo(config)
  return { config, tenantField: opts.tenantField ?? 'tenant', serverURL: opts.serverURL ?? config.serverURL, locales, defaultLocale }
}

export interface ResolvedTarget extends Target {
  fields: Record<string, string>
  col: CollectionLike
}

export interface Resolution<T = Loose> {
  result: AdapterValidationResult & { warnings: string[] }
  main?: ResolvedTarget
  /** Extra resolved targets (variants, returns, knowledge collections, booking services/staff/locations). */
  extra: Record<string, ResolvedTarget | undefined>
  knowledge?: { target: ResolvedTarget; urlPattern?: string; visibility: string; bodyPaths: string[] }[]
  options: T
}

const sub = (path: string, currency: string | undefined) => (currency ? path.replace(/\{CURRENCY\}/g, currency) : path)

/** First existing candidate path. */
export const pickPath = (env: ResolveEnv, col: CollectionLike, cands: Candidates | null | undefined, currency?: string) =>
  list(cands)
    .map((p) => sub(p, currency))
    .find((p) => hasFieldPath(env.config, col, p))

const detectCurrency = (col: CollectionLike | undefined): string | undefined => {
  const names: string[] = []
  const walk = (fields: CollectionLike['fields']) => {
    for (const f of fields ?? []) {
      const m = f.name?.match(/^priceIn([A-Z]{3})$/)
      if (m) names.push(m[1])
      if (f.fields) walk(f.fields)
      for (const t of f.tabs ?? []) walk(t.fields)
    }
  }
  if (col) walk(col.fields)
  return names[0]
}

interface TargetSpec {
  label: string
  candidates: string[]
  explicitCollection: boolean
  fields: Record<string, string[]>
  explicitFields: Set<string>
  required: string[]
  published?: PublishedCheck
  tenantField?: string | null
  where?: Where
  currency?: string
  /** A missing collection is only a warning (preset candidates for knowledge / nested targets). */
  optional?: boolean
  /** Field keys whose paths are relative to another field (e.g. order items). */
  relativeTo?: Record<string, string>
}

const resolveTarget = (
  env: ResolveEnv,
  spec: TargetSpec,
  problems: string[],
  warnings: string[],
): ResolvedTarget | undefined => {
  const existing = spec.candidates.find((s) => getCollection(env.config, s))
  if (!existing) {
    const msg =
      spec.candidates.length === 0
        ? `${spec.label}: no collection configured`
        : `${spec.label}: collection ${spec.candidates.map((c) => `'${c}'`).join(' / ')} not found in payload.config`
    if (spec.explicitCollection || !spec.optional) problems.push(msg)
    else warnings.push(msg)
    return undefined
  }
  const col = getCollection(env.config, existing)!
  const fields: Record<string, string> = {}
  const relBase = (key: string) => (spec.relativeTo?.[key] ? fields[spec.relativeTo[key]] : undefined)
  const order = Object.keys(spec.fields).sort((a, b) => Number(!!spec.relativeTo?.[a]) - Number(!!spec.relativeTo?.[b]))
  for (const key of order) {
    const cands = spec.fields[key]
    const base = relBase(key)
    if (spec.relativeTo?.[key] && !base) continue
    const found = cands
      .map((p) => sub(p, spec.currency))
      .find((p) => hasFieldPath(env.config, col, base ? `${base}.${p}` : p))
    if (found) fields[key] = found
    else {
      const shown = cands.map((p) => `'${sub(p, spec.currency)}'`).join(' / ')
      const msg = `${spec.label}: field ${key} -> ${shown} not found in '${existing}'${base ? ` (under '${base}')` : ''}`
      if (spec.explicitFields.has(key) || spec.required.includes(key)) problems.push(msg)
      else if (cands.length) warnings.push(msg)
    }
  }
  let published: PublishedRule | undefined
  const p = spec.published ?? 'auto'
  if (p === 'auto') published = hasDrafts(col) ? { field: '_status', equals: 'published' } : undefined
  else if (p) {
    if (hasFieldPath(env.config, col, p.field)) published = { field: p.field, equals: p.equals }
    else problems.push(`${spec.label}: published field '${p.field}' not found in '${existing}'`)
  }
  let tenantField: string | undefined
  if (spec.tenantField !== null) {
    const tf = spec.tenantField ?? env.tenantField
    if (hasFieldPath(env.config, col, tf)) tenantField = tf
    else if (spec.tenantField) problems.push(`${spec.label}: tenant field '${tf}' not found in '${existing}'`)
  }
  return { collection: existing, col, fields, published, tenantField, where: spec.where }
}

const ORDER_ITEM_KEYS = { itemOffering: 'items', itemVariant: 'items', itemQuantity: 'items', itemPrice: 'items', itemTitle: 'items' }

const asCands = (fields: unknown): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries((fields as Loose) ?? {})) if (v != null) out[k] = list(v as Candidates)
  return out
}

const explicitIn = (m: MergedConcept, prefix: string) =>
  new Set([...m.explicitNested].filter((k) => k.startsWith(`${prefix}.fields.`)).map((k) => k.slice(prefix.length + 8)))

export const resolveConcept = (env: ResolveEnv, concept: ConceptName, m: MergedConcept | undefined, presetName: string): Resolution => {
  const problems: string[] = []
  const warnings: string[] = []
  const extra: Record<string, ResolvedTarget | undefined> = {}
  const result = (collection?: string): Resolution['result'] => ({
    concept,
    ok: problems.length === 0,
    collection,
    problems,
    warnings,
  })
  if (!m) {
    problems.push(`${concept}: not configured for preset '${presetName}' (tools needing it are disabled)`)
    return { result: result(), extra, options: {} }
  }
  const o: Loose = { ...m.options }

  if (concept === 'knowledge') {
    const entries = (o.collections as unknown[] | undefined) ?? m.candidates
    const explicit = m.explicitNested.has('collections') || m.explicitCollection
    const knowledge: NonNullable<Resolution['knowledge']> = []
    for (const e of entries) {
      const entry = (typeof e === 'string' ? { collection: e } : e) as Loose & { collection: string }
      const userFields = asCands(entry.fields)
      const fields: Record<string, string[]> = { ...asCands(KNOWLEDGE_FIELD_DEFAULTS), ...userFields }
      const bodyCands = fields.body ?? []
      delete fields.body
      const t = resolveTarget(
        env,
        {
          label: `knowledge(${entry.collection})`,
          candidates: [entry.collection],
          explicitCollection: explicit,
          fields,
          explicitFields: new Set(Object.keys(userFields).filter((k) => k !== 'body')),
          required: ['title'],
          optional: !explicit,
          published: entry.published as PublishedCheck | undefined,
          tenantField: entry.tenantField as string | null | undefined,
        },
        problems,
        warnings,
      )
      if (!t) continue
      // Body: explicit list -> all must exist; defaults -> every existing candidate is used.
      const bodyPaths = bodyCands.filter((p) => hasFieldPath(env.config, t.col, p))
      if (!userFields.body)
        for (const p of fieldPathsByType(t.col, ['richText', 'blocks'])) if (!bodyPaths.includes(p)) bodyPaths.push(p)
      if (userFields.body) {
        for (const p of bodyCands) if (!bodyPaths.includes(p)) problems.push(`knowledge(${entry.collection}): body field '${p}' not found`)
      } else if (!bodyPaths.length) warnings.push(`knowledge(${entry.collection}): no body field found; title only`)
      knowledge.push({
        target: t,
        urlPattern: (entry.urlPattern as string | undefined) ?? KNOWLEDGE_URLS[entry.collection],
        visibility: (entry.visibility as string | undefined) ?? 'public',
        bodyPaths,
      })
    }
    if (!knowledge.length && !problems.length) problems.push(`knowledge: none of ${entries.map((e) => `'${typeof e === 'string' ? e : (e as Loose).collection}'`).join(', ')} exist`)
    return { result: result(knowledge.map((k) => k.target.collection).join(',') || undefined), extra, knowledge, options: o }
  }

  // Currency-dependent defaults (ecommerce `priceIn<CODE>`).
  let currency = o.currency as string | undefined
  if (!currency && (concept === 'offering' || concept === 'cart' || concept === 'order')) {
    const productSlug = concept === 'offering' ? m.candidates.find((s) => getCollection(env.config, s)) : 'products'
    currency = detectCurrency(getCollection(env.config, productSlug)) ?? 'USD'
  }

  const main = resolveTarget(
    env,
    {
      label: concept,
      candidates: m.candidates,
      explicitCollection: m.explicitCollection,
      fields: m.fields,
      explicitFields: m.explicitFields,
      required: m.required,
      published: o.published as PublishedCheck | undefined,
      tenantField: o.tenantField as string | null | undefined,
      where: o.where as Where | undefined,
      currency,
      relativeTo: concept === 'order' || concept === 'cart' ? ORDER_ITEM_KEYS : undefined,
    },
    problems,
    warnings,
  )

  const nested = (key: string, label: string, required: string[] = [], defaultCandidates: string[] = []) => {
    const v = o[key]
    if (v === false || (v == null && !defaultCandidates.length)) return undefined
    const n = (isObj(v) ? v : {}) as Loose
    const col = n.collection as string | undefined
    return resolveTarget(
      env,
      {
        label,
        candidates: col ? [col] : defaultCandidates,
        explicitCollection: m.explicitNested.has(`${key}.collection`),
        fields: asCands(n.fields),
        explicitFields: explicitIn(m, key),
        required: m.explicitNested.has(`${key}.collection`) ? required : [],
        optional: !m.explicitNested.has(`${key}.collection`),
        published: n.published as PublishedCheck | undefined,
        tenantField: o.tenantField as string | null | undefined,
        currency,
      },
      problems,
      warnings,
    )
  }

  if (main && concept === 'offering') extra.variants = nested('variants', 'offering.variants', ['product'])
  if (main && concept === 'order') {
    extra.returns = nested('returns', 'order.returns', [], ['ai-tickets'])
    if (!extra.returns && !problems.length) warnings.push('order: createReturnRequest unavailable (no returns collection)')
  }
  if (main && concept === 'booking') {
    const subTarget = (key: string, fieldKeys: string[], def: string) => {
      const v = o[key]
      if (v === false) return undefined
      const n = (isObj(v) ? v : {}) as Loose
      const fields: Record<string, string[]> = {}
      const explicitFields = new Set<string>()
      for (const fk of fieldKeys) {
        if (n[fk] == null) continue
        fields[fk] = list(n[fk] as Candidates)
        if (m.explicitNested.has(`${key}.${fk}`)) explicitFields.add(fk)
      }
      return resolveTarget(
        env,
        {
          label: `booking.${key}`,
          candidates: n.collection ? [String(n.collection)] : [def],
          explicitCollection: m.explicitNested.has(`${key}.collection`),
          fields,
          explicitFields,
          required: [],
          optional: !m.explicitNested.has(`${key}.collection`),
          published: false,
          tenantField: o.tenantField as string | null | undefined,
        },
        problems,
        warnings,
      )
    }
    extra.services = subTarget('services', ['durationField'], 'services')
    extra.staff = subTarget('staff', ['servicesField', 'locationField'], 'staff')
    extra.locations = subTarget('locations', ['hoursField'], 'locations')
  }
  if (main && concept === 'customer' && isObj(o.role)) {
    const r = o.role as { field: string; value: string }
    if (hasFieldPath(env.config, main.col, r.field)) main.where = { ...(main.where ?? {}), [r.field]: { in: [r.value] } } as Where
    else warnings.push(`customer: role field '${r.field}' not found; all '${main.collection}' docs treated as customers`)
  }
  if (main && concept === 'review' && o.held === undefined && hasFieldPath(env.config, main.col, 'held')) o.held = { field: 'held' }
  if (main && concept === 'review' && isObj(o.held) && !hasFieldPath(env.config, main.col, String(o.held.field)))
    problems.push(`review: held field '${String(o.held.field)}' not found`)

  return { result: result(main?.collection), main, extra, options: { ...o, currency } }
}

export const resolveAll = (env: ResolveEnv, merged: Partial<Record<ConceptName, MergedConcept>>, presetName: string) => {
  const out = {} as Record<ConceptName, Resolution>
  for (const c of CONCEPTS) out[c] = resolveConcept(env, c, merged[c], presetName)
  return out
}
