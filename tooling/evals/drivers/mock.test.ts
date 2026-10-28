import { describe, expect, it } from 'vitest'
import { mockAssistant, mockSearch, parsePriceMax } from './mock'

describe('mock driver', () => {
  it('parses price caps in English and Bangla', () => {
    expect(parsePriceMax('red saree under 3,000 taka')).toBe(300000)
    expect(parsePriceMax('৩০০০ টাকার নিচে শাড়ি')).toBe(300000)
    expect(parsePriceMax('red saree')).toBeUndefined()
  })
  it('applies price caps as hard filters', () => {
    expect(mockSearch('silk saree under 3000 taka')).not.toContain('green-katan-silk-saree')
  })
  it('never returns another customer order', () => {
    const o = mockAssistant({ id: 'x', locale: 'en', actor: 'customerB', message: 'Where is DS-1001?' })
    expect(JSON.stringify(o)).not.toContain('PTH-77810021')
  })
})
