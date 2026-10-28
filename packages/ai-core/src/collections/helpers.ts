import type { PayloadRequest } from 'payload'
import type { AICoreOptions, Crypto } from '../contracts'
import { rolesOf } from '../access'
import { createAuditService } from '../audit'
import { createCrypto } from '../crypto'

let cryptoMemo: { env?: string; c: Crypto } | undefined
/** Crypto keyed from options.secretEnv (default PAYLOAD_SECRET); shared by collection hooks. */
export const hookCrypto = (options?: AICoreOptions): Crypto => {
  if (!cryptoMemo || cryptoMemo.env !== options?.secretEnv) cryptoMemo = { env: options?.secretEnv, c: createCrypto({ secretEnv: options?.secretEnv }) }
  return cryptoMemo.c
}

/** Audit a config change made through the admin/API. */
export const auditChange = async (
  req: PayloadRequest,
  options: AICoreOptions | undefined,
  entry: { action: string; target?: { collection?: string; id?: string | number }; before?: unknown; after?: unknown },
): Promise<void> => {
  if (req.context?.aiAuditInternal) return
  const tenantField = options?.tenant?.field
  const tenant = options?.tenant?.resolve?.(req)
  await createAuditService({ tenantField }).log(entry, {
    payload: req.payload,
    tenant,
    requestId: (req.headers?.get?.('x-request-id') as string | null) ?? `admin-${Date.now().toString(36)}`,
    actor: { kind: req.user ? 'staff' : 'system', user: req.user, roles: rolesOf(req.user, req) },
  })
}

/** Remove secrets from a document snapshot before it goes into the audit log. */
export const scrub = <T extends Record<string, unknown> | undefined>(doc: T): T => {
  if (!doc) return doc
  const { encryptedKey: _e, apiKey: _a, ...rest } = doc as Record<string, unknown>
  return rest as T
}
