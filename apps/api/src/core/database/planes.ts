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
  'Invitation',
  'ChangeRequest',
  'ChurchSequence',
  'FinanceIncomeSource',
  'FinanceExpenseItem',
  'FinanceTransaction',
  'Registration',
  'Person',
  'PersonStageEvent',
  'PersonNote',
  'MembershipApplication',
  'FoundationGroup',
  'FoundationEnrollment',
  'FoundationAttendance',
  'RegistrationReminder',
  'ChurchSetting',
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
  'Invitation',
  'EmailOutbox',
  'PasswordResetToken',
  'ApiClient',
]);

/** Phase 4 adds finance, Phase 5 membership and registrations. */
export const TENANT_PLANE_MODELS = new Set<string>([]);

/**
 * The same split, by table name, for checks that read the database's own
 * catalogue (and for the export and move tools of Phase 6).
 */
export const CONTROL_PLANE_TABLES = new Set<string>([
  'churches',
  'users',
  'sessions',
  'permissions',
  'church_memberships',
  'church_modules',
  'roles',
  'role_permissions',
  'membership_roles',
  'impersonation_sessions',
  'usage_daily',
  'platform_usage_daily',
  'user_activity_daily',
  'job_runs',
  'church_placements',
  'audit_events',
  'invitations',
  'email_outbox',
  'password_reset_tokens',
  'api_clients',
]);

/** A church's own records: these move with the church. */
export const TENANT_PLANE_TABLES = new Set<string>([
  'change_requests',
  'church_sequences',
  'finance_income_sources',
  'finance_expense_items',
  'finance_transactions',
  'registrations',
  'people',
  'person_stage_events',
  'person_notes',
  'membership_applications',
  'foundation_groups',
  'foundation_enrollments',
  'foundation_attendance',
  'registration_reminders',
  'church_settings',
]);

/** Tables the tenant extension scopes, by table name. */
export const TENANT_TABLES = new Set<string>([
  'church_memberships',
  'church_modules',
  'roles',
  'role_permissions',
  'membership_roles',
  'invitations',
  'change_requests',
  'church_sequences',
  'finance_income_sources',
  'finance_expense_items',
  'finance_transactions',
  'registrations',
  'people',
  'person_stage_events',
  'person_notes',
  'membership_applications',
  'foundation_groups',
  'foundation_enrollments',
  'foundation_attendance',
  'registration_reminders',
  'church_settings',
]);
