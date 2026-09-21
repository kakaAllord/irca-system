/**
 * Which tables belong to whom (docs/plan/multi-tenancy.md, sections 1 and 13).
 *
 * TENANT_MODELS: every model with a church_id, scoped automatically by the
 * tenant extension. CONTROL_MODELS: who and how, always in the shared
 * database. TENANT_PLANE_MODELS: a church's own records, which move with the
 * church if it ever gets a database of its own.
 *
 * A test fails when a model is in neither list, so adding a table forces the
 * decision rather than leaving it to chance.
 */
export const TENANT_MODELS = new Set<string>([
  'ChurchMembership',
  'ChurchModule',
  'Role',
  'RolePermission',
  'MembershipRole',
]);

export const CONTROL_MODELS = new Set<string>([
  'Church',
  'User',
  'Session',
  'Permission',
  'ChurchMembership',
  'ChurchModule',
  'Role',
  'RolePermission',
  'MembershipRole',
  'ImpersonationSession',
  'UsageDaily',
  'PlatformUsageDaily',
  'UserActivityDaily',
  'JobRun',
  'ChurchPlacement',
  'AuditEvent',
]);

/** Phase 4 adds finance, Phase 5 membership and registrations. */
export const TENANT_PLANE_MODELS = new Set<string>([]);
