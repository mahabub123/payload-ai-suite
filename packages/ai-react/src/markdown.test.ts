import { describe, expect, it } from 'vitest'
import { renderMarkdown, safeUrl } from './markdown'

describe('renderMarkdown', () => {
  it('renders basic markdown', () => {
    expect(renderMarkdown('**Hi** _there_\n\n- a\n- `b`')).toBe('<p><strong>Hi</strong> <em>there</em></p><ul><li>a</li><li><code>b</code></li></ul>')
    expect(renderMarkdown('see [policy](https://shop.test/returns?a=1&b=2)')).toBe(
      '<p>see <a href="https://shop.test/returns?a=1&amp;b=2" target="_blank" rel="noopener noreferrer nofollow">policy</a></p>',
    )
  })

  it('escapes raw HTML', () => {
    const out = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>')
    expect(out).not.toMatch(/<script|<img/i)
    expect(out).toContain('&lt;script&gt;')
  })

  it.each([
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x](java\tscript:alert(1))',
    '[x](data:text/html;base64,PHNjcmlwdD4=)',
    '[x](vbscript:msgbox)',
    '[x](//evil.test)',
  ])('drops unsafe link %s', (md) => {
    const out = renderMarkdown(md)
    expect(out).not.toContain('<a')
    expect(out).toContain('x')
  })

  it('cannot break out of the href attribute', () => {
    const out = renderMarkdown('[x](https://a.test/"onmouseover="alert(1))')
    expect(out).not.toMatch(/"\s*onmouseover=/)
    expect(renderMarkdown('[*x*](/a*b*c)')).toBe('<p><a href="/a*b*c" target="_blank" rel="noopener noreferrer nofollow"><em>x</em></a></p>')
  })

  it('allows relative, mailto and tel links', () => {
    expect(safeUrl('/products/1')).toBe('/products/1')
    expect(safeUrl('mailto:help@shop.test')).toBe('mailto:help@shop.test')
    expect(safeUrl('tel:+8801700000000')).toBe('tel:+8801700000000')
  })
})
