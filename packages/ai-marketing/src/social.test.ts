import { describe, expect, it } from 'vitest'
import { PLATFORM_LIMITS, charCount, composePost, fitToLimit, socialEndpoint } from './social'
import { setup } from '../test/setup'

describe('social copy character limits', () => {
  it('keeps every platform within its limit', () => {
    const long = 'Fresh spring styles are here. '.repeat(200)
    for (const p of Object.keys(PLATFORM_LIMITS) as (keyof typeof PLATFORM_LIMITS)[]) {
      expect(charCount(composePost(p, long, ['spring', 'sale']))).toBeLessThanOrEqual(PLATFORM_LIMITS[p])
    }
  })

  it('drops hashtags before cutting text', () => {
    const text = 'a'.repeat(275)
    expect(composePost('x', text, ['one', 'two'])).toBe(text)
    expect(composePost('x', 'short', ['one', 'two'])).toBe('short\n\n#one #two')
  })

  it('counts emoji as one character and cuts at word boundaries', () => {
    expect(charCount('🎉🎉')).toBe(2)
    const cut = fitToLimit('word '.repeat(100), 50)
    expect(charCount(cut)).toBeLessThanOrEqual(50)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('endpoint enforces limits on model output', async () => {
    const { services, staff, req } = setup()
    services.provider.enqueue({
      object: {
        posts: [
          { platform: 'x', text: 'x'.repeat(400), hashtags: ['sale'] },
          { platform: 'instagram', text: 'Nice', hashtags: ['spring'] },
        ],
      },
    })
    const input = socialEndpoint.input!.parse({ brief: 'spring sale', platforms: ['x', 'instagram', 'linkedin'] })
    const out = (await socialEndpoint.handler({ ctx: staff('u1'), services, input, req: req('u1') })) as {
      posts: { platform: string; chars: number; limit: number; text: string }[]
      missing: string[]
    }
    expect(out.posts.find((p) => p.platform === 'x')!.chars).toBeLessThanOrEqual(280)
    expect(out.posts.find((p) => p.platform === 'instagram')!.text).toBe('Nice\n\n#spring')
    expect(out.missing).toEqual(['linkedin'])
  })
})
