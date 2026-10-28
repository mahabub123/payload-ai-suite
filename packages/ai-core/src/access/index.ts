import type { Access, PayloadRequest } from 'payload'
import type { SuiteRole } from '../contracts'
import { hasRole, isStaffRoles, rolesOf } from './roles'

export { rolesOf, hasRole, isStaffRoles, defaultRoles, coreOptionsFromReq } from './roles'

const roles = (req: PayloadRequest) => rolesOf(req.user, req)

/**
 * Collection access helpers matching the §12 access matrix.
 * Tenant scoping of reads is applied by the core (and the Multi-Tenant plugin when installed).
 */
export const access = {
  superAdmin: (({ req }) => roles(req).includes('super-admin')) as Access,
  /** Super admin or store admin. */
  admin: (({ req }) => hasRole(roles(req), ['store-admin'])) as Access,
  /** Any staff role. */
  staff: (({ req }) => isStaffRoles(roles(req))) as Access,
  /** Staff with one of these roles (super-admin and store-admin always pass). */
  roles:
    (...wanted: SuiteRole[]): Access =>
    ({ req }) =>
      hasRole(roles(req), ['store-admin', ...wanted]),
  anyone: (() => true) as Access,
  nobody: (() => false) as Access,
}
