import { ChannelSendError } from './types'

/** POST JSON to a provider API; classify failures into transient / permanent ChannelSendError. */
export const postJson = async (
  fetchFn: typeof fetch,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<any> => {
  let res: Response
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    throw new ChannelSendError(`Network error: ${(e as Error).message}`, { transient: true })
  }
  const text = await res.text()
  let json: any = undefined
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    /* non-JSON body */
  }
  if (res.ok) return json
  const err = json?.error ?? {}
  const code = Number(err.code)
  const subcode = Number(err.error_subcode)
  const transient = res.status === 429 || res.status >= 500 || err.is_transient === true || code === 4 || code === 80007
  throw new ChannelSendError(`HTTP ${res.status}: ${err.message ?? text.slice(0, 200)}`, {
    transient,
    status: res.status,
    // 131047: WhatsApp re-engagement required; 2018278: Messenger message sent outside allowed window.
    outsideWindow: code === 131047 || subcode === 2018278,
  })
}
