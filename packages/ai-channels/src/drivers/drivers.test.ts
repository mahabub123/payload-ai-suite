import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from './signature'
import { createEmailDriver } from './email'
import { createMessengerDriver, createWhatsAppDriver } from './meta'
import type { WebhookRequest } from './types'
import { stripQuotedReply } from '../email'

const ENV = {
  WA_PHONE: '1111',
  WA_TOKEN: 'tok',
  WA_SECRET: 'app-secret',
  WA_VERIFY: 'verify-me',
  FB_TOKEN: 'page-tok',
  FB_SECRET: 'fb-secret',
  FB_VERIFY: 'fb-verify',
  MAIL_SECRET: 'mail-secret',
  BASIC: 'inbound:s3cret',
}

const wa = createWhatsAppDriver({ phoneNumberIdEnv: 'WA_PHONE', accessTokenEnv: 'WA_TOKEN', appSecretEnv: 'WA_SECRET', verifyTokenEnv: 'WA_VERIFY' }, ENV)
const fb = createMessengerDriver({ pageAccessTokenEnv: 'FB_TOKEN', appSecretEnv: 'FB_SECRET', verifyTokenEnv: 'FB_VERIFY' }, ENV)

const req = (rawBody: string, headers: Record<string, string> = {}, query = ''): WebhookRequest => ({
  rawBody,
  headers: new Headers(headers),
  query: new URLSearchParams(query),
})

export const waBody = (id = 'wamid.1', text = 'hi', from = '8801700000000') =>
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: '1111' }, messages: [{ id, from, timestamp: '1761600000', type: 'text', text: { body: text } }] } }] }],
  })

describe('Meta signature (X-Hub-Signature-256)', () => {
  it('accepts a valid HMAC over the raw body', async () => {
    const body = waBody()
    const sig = `sha256=${hmacSha256Hex('app-secret', body)}`
    expect(await wa.verifyRequest(req(body, { 'x-hub-signature-256': sig }))).toEqual({ ok: true })
  })

  it('rejects a bad signature, a missing header, and a body re-serialized after signing', async () => {
    const body = waBody()
    const sig = `sha256=${hmacSha256Hex('app-secret', body)}`
    expect((await wa.verifyRequest(req(body, { 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` }))).ok).toBe(false)
    expect((await wa.verifyRequest(req(body))).ok).toBe(false)
    const reformatted = JSON.stringify(JSON.parse(body), null, 2)
    expect((await wa.verifyRequest(req(reformatted, { 'x-hub-signature-256': sig }))).ok).toBe(false)
    // signed with another app's secret
    expect((await fb.verifyRequest(req(body, { 'x-hub-signature-256': sig }))).ok).toBe(false)
  })

  it('fails closed when the app secret is not configured', async () => {
    const d = createWhatsAppDriver({ phoneNumberIdEnv: 'X', accessTokenEnv: 'X', appSecretEnv: 'MISSING', verifyTokenEnv: 'X' }, {})
    const body = waBody()
    const r = await d.verifyRequest(req(body, { 'x-hub-signature-256': `sha256=${hmacSha256Hex('', body)}` }))
    expect(r).toEqual({ ok: false, reason: 'missing_app_secret' })
  })
})

describe('Meta verify challenge', () => {
  it('echoes hub.challenge only for the right verify token', () => {
    expect(wa.verifyChallenge!(new URLSearchParams('hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'))).toBe('12345')
    expect(wa.verifyChallenge!(new URLSearchParams('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'))).toBeNull()
    expect(wa.verifyChallenge!(new URLSearchParams('hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1'))).toBeNull()
    expect(fb.verifyChallenge!(new URLSearchParams('hub.mode=subscribe&hub.verify_token=fb-verify&hub.challenge=abc'))).toBe('abc')
  })
})

describe('parseInbound', () => {
  it('normalizes WhatsApp messages and ignores status callbacks', async () => {
    const msgs = await wa.parseInbound(req(waBody('wamid.X', 'Do you have red shoes?')))
    expect(msgs).toEqual([
      { externalMessageId: 'wamid.X', externalUserId: '8801700000000', text: 'Do you have red shoes?', timestamp: new Date(1761600000_000).toISOString() },
    ])
    const statuses = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'read' }] } }] }] })
    expect(await wa.parseInbound(req(statuses))).toEqual([])
  })

  it('normalizes Messenger messages and skips echoes', async () => {
    const body = JSON.stringify({
      object: 'page',
      entry: [
        {
          messaging: [
            { sender: { id: 'psid1' }, recipient: { id: 'page' }, timestamp: 1761600000000, message: { mid: 'm1', text: 'hello' } },
            { sender: { id: 'page' }, recipient: { id: 'psid1' }, timestamp: 1761600000001, message: { mid: 'm2', text: 'echo', is_echo: true } },
          ],
        },
      ],
    })
    const msgs = await fb.parseInbound(req(body))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatchObject({ externalMessageId: 'm1', externalUserId: 'psid1', text: 'hello' })
  })
})

describe('email providers', () => {
  const now = new Date('2026-10-28T10:00:00Z')
  const ts = String(Math.floor(now.getTime() / 1000))
  const generic = createEmailDriver({ provider: 'generic', signingSecretEnv: 'MAIL_SECRET', replyFrom: 'Shop <help@shop.test>' }, ENV)
  const body = JSON.stringify({
    messageId: '<abc@mail.test>',
    from: 'Rahim Uddin <Rahim@Example.com>',
    subject: 'Re: My order',
    text: 'Where is my order?\n\nOn Mon, 27 Oct 2026 at 10:00, Shop <help@shop.test> wrote:\n> Thanks for your order\n',
    references: '<root@shop.test> <prev@shop.test>',
    inReplyTo: '<prev@shop.test>',
  })

  it('generic: verifies HMAC over timestamp.body and rejects stale (replayed) timestamps', async () => {
    const sig = hmacSha256Hex('mail-secret', `${ts}.${body}`)
    expect(await generic.verifyRequest(req(body, { 'x-timestamp': ts, 'x-signature': sig }), now)).toEqual({ ok: true })
    expect((await generic.verifyRequest(req(body, { 'x-timestamp': ts, 'x-signature': sig.replace(/^./, 'f') }), now)).ok).toBe(false)
    const later = new Date(now.getTime() + 10 * 60_000)
    expect(await generic.verifyRequest(req(body, { 'x-timestamp': ts, 'x-signature': sig }), later)).toEqual({ ok: false, reason: 'stale_timestamp' })
  })

  it('generic: parses sender, strips quoted reply, keeps threading headers', async () => {
    const [m] = await generic.parseInbound(req(body))
    expect(m.externalUserId).toBe('rahim@example.com')
    expect(m.text).toBe('Where is my order?')
    expect(m.email).toMatchObject({ subject: 'Re: My order', inReplyTo: '<prev@shop.test>', references: ['<root@shop.test>', '<prev@shop.test>'], fromName: 'Rahim Uddin' })
  })

  it('mailgun: verifies signature and rejects a replayed token', async () => {
    const mg = createEmailDriver({ provider: 'mailgun', signingSecretEnv: 'MAIL_SECRET', replyFrom: 'help@shop.test' }, ENV)
    const token = 'tok-123'
    const form = new URLSearchParams({
      timestamp: ts,
      token,
      signature: hmacSha256Hex('mail-secret', `${ts}${token}`),
      from: 'a@b.test',
      subject: 'Hi',
      'body-plain': 'Hello',
      'Message-Id': '<m1@b.test>',
    }).toString()
    const h = { 'content-type': 'application/x-www-form-urlencoded' }
    expect(await mg.verifyRequest(req(form, h), now)).toEqual({ ok: true })
    expect(await mg.verifyRequest(req(form, h), now)).toEqual({ ok: false, reason: 'replayed' })
    const [m] = await mg.parseInbound(req(form, h))
    expect(m).toMatchObject({ externalMessageId: '<m1@b.test>', externalUserId: 'a@b.test', text: 'Hello' })
  })

  it('postmark / sendgrid: HTTP basic credentials', async () => {
    const pm = createEmailDriver({ provider: 'postmark', signingSecretEnv: 'BASIC', replyFrom: 'help@shop.test' }, ENV)
    const good = `Basic ${Buffer.from('inbound:s3cret').toString('base64')}`
    const bad = `Basic ${Buffer.from('inbound:nope').toString('base64')}`
    expect((await pm.verifyRequest(req('{}', { authorization: good }))).ok).toBe(true)
    expect((await pm.verifyRequest(req('{}', { authorization: bad }))).ok).toBe(false)
    const pmBody = JSON.stringify({
      FromFull: { Email: 'C@D.test', Name: 'C' },
      Subject: 'Question',
      TextBody: 'full',
      StrippedTextReply: 'Is this in stock?',
      MessageID: 'pm-1',
      Headers: [{ Name: 'Message-ID', Value: '<x@d.test>' }],
    })
    const [m] = await pm.parseInbound(req(pmBody))
    expect(m).toMatchObject({ externalMessageId: '<x@d.test>', externalUserId: 'c@d.test', text: 'Is this in stock?' })

    const sg = createEmailDriver({ provider: 'sendgrid', signingSecretEnv: 'BASIC', replyFrom: 'help@shop.test' }, ENV)
    const fd = new FormData()
    fd.set('from', 'E <e@f.test>')
    fd.set('subject', 'Hello')
    fd.set('text', 'Need help\n-- \nE, CEO')
    fd.set('headers', 'Message-ID: <sg1@f.test>\nReferences: <r1@shop.test>\n')
    const r = new Request('http://x', { method: 'POST', body: fd })
    const raw = await r.text()
    const [s] = await sg.parseInbound(req(raw, { 'content-type': r.headers.get('content-type')! }))
    expect(s).toMatchObject({ externalMessageId: '<sg1@f.test>', externalUserId: 'e@f.test', text: 'Need help' })
    expect(s.email?.references).toEqual(['<r1@shop.test>'])
  })
})

describe('stripQuotedReply', () => {
  it('removes quotes, Outlook headers and signatures', () => {
    expect(stripQuotedReply('Yes please\n\n-----Original Message-----\nFrom: x')).toBe('Yes please')
    expect(stripQuotedReply('Ok\n> old\n> older')).toBe('Ok')
    expect(stripQuotedReply('Thanks\n--\nJohn')).toBe('Thanks')
    expect(stripQuotedReply('Sure\n\nSent from my iPhone')).toBe('Sure')
    expect(stripQuotedReply('Fine\nOn Tue, Oct 28, 2026 at 9:00 AM Shop <a@b.c>\nwrote:\n> q')).toBe('Fine')
  })
})
