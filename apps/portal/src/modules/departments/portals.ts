import { CHURCH_MODULES } from '@irca/shared';
import type { PortalChoice } from './DepartmentDrawer';
import type { DepartmentRow } from './types';

/** The department portals, and which department each already belongs to. */
export function portalChoices(departments: DepartmentRow[]): PortalChoice[] {
  return CHURCH_MODULES.filter((m) => m.kind === 'department').map((m) => ({
    key: m.key,
    name: m.name,
    takenBy: departments.find((d) => d.portal?.key === m.key)?.name ?? null,
  }));
}
