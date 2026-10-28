/** Minimal Cloudflare Turnstile helper: renders an invisible widget and resolves one token. */
interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string
  remove(id: string): void
}

let loading: Promise<TurnstileApi | null> | null = null

const load = (): Promise<TurnstileApi | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const w = window as unknown as { turnstile?: TurnstileApi }
  if (w.turnstile) return Promise.resolve(w.turnstile)
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve(w.turnstile ?? null)
    s.onerror = () => {
      loading = null
      resolve(null)
    }
    document.head.appendChild(s)
  })
  return loading
}

export const getTurnstileToken = async (siteKey: string, timeoutMs = 15_000): Promise<string | undefined> => {
  const api = await load()
  if (!api) return undefined
  return new Promise((resolve) => {
    const el = document.createElement('div')
    el.style.display = 'none'
    document.body.appendChild(el)
    let id = ''
    const done = (token?: string) => {
      clearTimeout(timer)
      try {
        if (id) api.remove(id)
      } catch {
        // ignore
      }
      el.remove()
      resolve(token)
    }
    const timer = setTimeout(() => done(undefined), timeoutMs)
    id = api.render(el, {
      sitekey: siteKey,
      size: 'invisible',
      callback: (t: string) => done(t),
      'error-callback': () => done(undefined),
    })
  })
}
