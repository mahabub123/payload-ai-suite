import type { PayloadRequest, TypedUser } from 'payload'
import type { AICoreOptions, SuiteRole } from '../contracts'
import { SUITE_KEY } from '../module/constants'

const STAFF_ROLES: ReadonlySet<SuiteRole> = new Set([
  'super-admin',
  'store-admin',
  'content',
  'marketing-approver',
  'support',
  'manager',
])

const ALIASES: Record<string, SuiteRole> = {
  'super-admin': 'super-admin',
  superadmin: 'super-admin',
  'super admin': 'super-admin',
  admin: 'store-admin',
  'store-admin': 'store-admin',
  editor: 'content',
  content: 'content',
  marketing: 'marketing-approver',
  'marketing-manager': 'marketing-approver',
  'marketing-approver': 'marketing-approver',
  support: 'support',
  manager: 'manager',
  customer: 'customer',
}

export const coreOptionsFromReq = (req: Pick<PayloadRequest, 'payload'>): AICoreOptions | undefined =>
  ((req.payload?.config?.custom as Record<string, any> | undefined)?.[SUITE_KEY]?.options as AICoreOptions | undefined)

/**
 * Default role mapping: reads `user.roles` (array) or `user.role` (string) and maps common names.
 * A user from the staff collection with no roles field at all is treated as super-admin
 * (single-admin sites using Payload's default users collection).
 */
export const defaultRoles = (user: TypedUser, opts?: AICoreOptions): SuiteRole[] => {
  const u = user as unknown as Record<string, unknown>
  const raw = Array.isArray(u.roles) ? (u.roles as unknown[]) : typeof u.role === 'string' ? [u.role] : undefined
  if (!raw) {
    const customers = opts?.userCollections?.customers
    if (customers && user.collection === customers) return ['customer']
    return ['super-admin']
  }
  const roles = new Set<SuiteRole>()
  for (const r of raw) {
    const mapped = typeof r === 'string' ? ALIASES[r.toLowerCase()] : undefined
    if (mapped) roles.add(mapped)
  }
  const { customers, staff } = opts?.userCollections ?? {}
  // In a collection shared with staff, roles decide; only a customers-only collection implies 'customer'.
  if (customers && user.collection === customers && customers !== staff) roles.add('customer')
  return [...roles]
}

export const rolesOf = (user: TypedUser | null | undefined, req?: Pick<PayloadRequest, 'payload'>): SuiteRole[] => {
  if (!user) return []
  const opts = req ? coreOptionsFromReq(req) : undefined
  return opts?.roles ? opts.roles(user) : defaultRoles(user, opts)
}

export const isStaffRoles = (roles: SuiteRole[]): boolean => roles.some((r) => STAFF_ROLES.has(r))

export const hasRole = (roles: SuiteRole[], wanted: SuiteRole[]): boolean =>
  roles.includes('super-admin') || roles.some((r) => wanted.includes(r))
