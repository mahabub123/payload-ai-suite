import type { Access, FieldAccess, PayloadRequest, TypedUser } from 'payload'
import type { SuiteRole } from 'payload-ai-suite'

/** Site roles stored on users.roles. */
export const ROLES = ['super-admin', 'admin', 'content', 'marketing', 'support', 'manager', 'customer'] as const
export type Role = (typeof ROLES)[number]

export const STAFF_ROLES: Role[] = ['super-admin', 'admin', 'content', 'marketing', 'support', 'manager']

export const rolesOf = (user: unknown): Role[] => {
  const r = (user as { roles?: unknown } | null | undefined)?.roles
  return Array.isArray(r) ? (r.filter((x) => typeof x === 'string') as Role[]) : []
}

export const hasAnyRole = (user: unknown, wanted: Role[]): boolean => rolesOf(user).some((r) => wanted.includes(r))
export const isAdminUser = (user: unknown): boolean => hasAnyRole(user, ['super-admin', 'admin'])
export const isStaffUser = (user: unknown): boolean => hasAnyRole(user, STAFF_ROLES)

/** Maps site roles onto AI Suite roles (§12 access matrix). */
export const toSuiteRoles = (user: TypedUser): SuiteRole[] => {
  const map: Record<Role, SuiteRole> = {
    'super-admin': 'super-admin',
    admin: 'store-admin',
    content: 'content',
    marketing: 'marketing-approver',
    support: 'support',
    manager: 'manager',
    customer: 'customer',
  }
  return [...new Set(rolesOf(user).map((r) => map[r]))]
}

type Req = { req: PayloadRequest }

export const anyone: Access = () => true
export const adminOnly: Access = ({ req }: Req) => isAdminUser(req.user)
export const staffOnly: Access = ({ req }: Req) => isStaffUser(req.user)
export const roles =
  (...wanted: Role[]): Access =>
  ({ req }: Req) =>
    hasAnyRole(req.user, ['super-admin', 'admin', ...wanted])
export const adminFieldOnly: FieldAccess = ({ req }) => isAdminUser(req.user)
/** Staff see everything; everyone else only published docs. */
export const publishedOrStaff: Access = ({ req }: Req) => (isStaffUser(req.user) ? true : { _status: { equals: 'published' } })
