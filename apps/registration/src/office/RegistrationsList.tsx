import Link from 'next/link';
import { applicableSteps } from '@/lib/flow';
import { listRegistrations } from '@/lib/registration';
import { isAnswered } from '@/lib/validate';
import { ArrowRight } from '@/components/icons';

/**
 * The office list. This is what makes screen 25 reachable: the admin finds the
 * unfinished file and sends that person their own link.
 *
 * No longer served. This was the /admin route, and it had no sign-in in front
 * of it while holding names, phone numbers and prayer requests, so the route
 * was taken down. The component is kept, outside src/app so Next.js does not
 * route it, because it is the working reference for what the office relies on:
 * unfinished registrations first, how far each person got against the steps
 * they were actually shown, and their own link to carry on. Phase 5 of
 * docs/plan ports it into the Membership portal behind login and RBAC (steps
 * 5.9, 5.13 and 5.14), and step 5.19 deletes this file once that is live. The
 * links to /admin below point at routes that no longer exist.
 */
export default async function RegistrationsList() {
  const rows = await listRegistrations();

  return (
    <main className="admin">
      <div className="adminhead">
        <div>
          <h1>Registrations</h1>
          <p>Unfinished first. Send someone their link and they carry on where they stopped.</p>
        </div>
        <Link href="/admin/insights" className="adminlink">
          Where people get to <ArrowRight size={15} />
        </Link>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr>
              {['Name', 'Phone', 'Where', 'Progress', 'Updated', 'Link'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(reg => {
              const steps = applicableSteps(reg.values);
              const left = steps.filter(s => !isAnswered(s, reg.values, reg.lang)).length;
              const doneCount = steps.length - left;
              const submitted = reg.status === 'submitted';

              return (
                <tr key={reg.id}>
                  <td>{reg.values.fullname || <span className="zero">not yet</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {reg.values.phone ? `${reg.values.dial} ${reg.values.phone}` : 'not yet'}
                  </td>
                  <td>
                    {reg.values.where === 'arusha'
                      ? reg.values.ward === 'Other'
                        ? reg.values.wardOther
                        : reg.values.ward
                      : reg.values.region || reg.values.country || 'not yet'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {submitted ? (
                      <strong style={{ color: 'var(--accent-deep)' }}>Complete</strong>
                    ) : (
                      `${doneCount} / ${steps.length}`
                    )}
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {reg.updatedAt.toLocaleString()}
                  </td>
                  <td>
                    <Link href={`/r/${reg.token}`} className="adminlink">
                      /r/{reg.token.slice(0, 8)}…
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ padding: '28px 12px', color: 'var(--muted)' }}>
                  Nobody has registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
