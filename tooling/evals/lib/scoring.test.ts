import { describe, expect, it } from 'vitest'
import { judge } from './baseline'
import { extractPrices, normalize, scoreAssistant, scoreContent, scoreSearch, scriptRatio } from './scoring'

describe('normalize', () => {
  it('maps Bangla digits and strips thousands separators', () => {
    expect(normalize('৳২,৮৫০')).toBe('৳2850')
    expect(normalize('Tk 1,250.50')).toBe('tk 1250.50')
  })
})

describe('scoreAssistant', () => {
  const c = { id: 'x', locale: 'en' as const, message: 'm', expectTool: ['getPolicy', 'searchKnowledge'], mustInclude: ['7 days', ['bKash', 'Nagad']], mustNotInclude: ['SECRET'] }
  it('passes when tool, facts and exclusions hold', () => {
    const r = scoreAssistant(c, { text: 'Return within 7 days. Pay by Nagad.', tools: ['searchKnowledge'], cards: [] })
    expect(r.pass).toBe(true)
    expect(r.score).toBe(1)
  })
  it('finds facts in card data, not only text', () => {
    const r = scoreAssistant({ id: 'y', locale: 'en', message: 'm', mustInclude: ['RDX-1'] }, { text: '', tools: [], cards: [{ type: 'order', order: { tracking: 'RDX-1' } }] })
    expect(r.pass).toBe(true)
  })
  it('a leaked string is a hard fail even if everything else passes', () => {
    const r = scoreAssistant(c, { text: '7 days, bKash, SECRET', tools: ['getPolicy'], cards: [] })
    expect(r.pass).toBe(false)
    expect(r.reasons.join()).toMatch(/leaked/)
  })
  it('reports the wrong tool', () => {
    const r = scoreAssistant(c, { text: '7 days bKash', tools: ['searchOfferings'], cards: [] })
    expect(r.pass).toBe(false)
    expect(r.reasons[0]).toMatch(/expected tool/)
  })
})

describe('scoreSearch', () => {
  it('computes recall@k and reciprocal rank', () => {
    const r = scoreSearch({ id: 's', locale: 'en', query: 'q', expected: ['a', 'b'] }, { slugs: ['x', 'a', 'y', 'z', 'q', 'b'] })
    expect(r.recall).toBe(0.5)
    expect(r.rr).toBe(0.5)
    expect(r.pass).toBe(true)
  })
  it('fails on forbidden results in top-k', () => {
    const r = scoreSearch({ id: 's', locale: 'en', query: 'q', expected: ['a'], forbidden: ['bad'] }, { slugs: ['a', 'bad'] })
    expect(r.pass).toBe(false)
  })
})

describe('content checks', () => {
  it('detects script and invented prices', () => {
    expect(scriptRatio('লাল জামদানি শাড়ি', 'bengali')).toBe(1)
    expect(extractPrices('Only ৳2,850 or 3000 taka, ২০০ টাকা')).toEqual([285000, 300000, 20000])
    const r = scoreContent(
      { id: 'c', locale: 'en', task: 'description', product: 'p', checks: { minChars: 5, mustMention: ['saree'], banned: ['cheapest'], script: 'latin', noInventedPrices: true } },
      { text: 'The cheapest saree, only ৳999!' },
      285000,
    )
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/banned.*invented|invented/)
  })
})

describe('judge', () => {
  it('fails below threshold and on regression beyond tolerance, ignores latency', () => {
    const v = judge({ 'search.en.mrr': 0.5, 'content.en.passRate': 0.95, 'custom.x': 0.7, 'search.en.latencyP95Ms': 999 }, { 'content.en.passRate': 1, 'custom.x': 0.71 })
    const by = Object.fromEntries(v.map((x) => [x.metric, x]))
    expect(by['search.en.mrr'].ok).toBe(false)
    expect(by['content.en.passRate'].ok).toBe(false)
    expect(by['custom.x'].ok).toBe(true)
    expect(by['search.en.latencyP95Ms']).toBeUndefined()
  })
})
