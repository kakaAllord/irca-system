import Link from 'next/link';
import { listRegistrations } from '@/lib/registration';
import { computeInsights } from '@irca/shared/registration';
import { ArrowLeft } from '@/components/icons';

/**
 * Where people get to, and what they leave blank.
 *
 * Every figure is shown as a count and a percentage, because at a couple of
 * dozen visitors a Sunday a percentage on its own lies: "50% skipped it" reads
 * like a finding until you see it was one person out of two.
 *
 * No longer served: this was /admin/insights, taken down with the rest of the
 * unauthenticated /admin route. Kept outside src/app as the reference for the
 * question-by-question funnel and the option counts, which Phase 5 of docs/plan
 * carries into the Membership portal's Insights page (steps 5.12 and 5.17),
 * counts-beside-percentages rule included. Step 5.19 deletes this file once
 * that page is live.
 */
export default async function InsightsReport() {
  const rows = await listRegistrations(5000);
  const d = computeInsights(rows, 'en');

  return (
    <main className="admin">
      <div className="adminhead">
        <div>
          <h1>Where people get to</h1>
          <p>
            Counts and percentages together, because with this many visitors a
            percentage on its own can be one person.
          </p>
        </div>
        <Link href="/admin" className="adminlink">
          <ArrowLeft size={15} /> Registrations
        </Link>
      </div>

      <div className="stats">
        <Stat label="Started" value={String(d.started)} />
        <Stat label="Completed" value={String(d.submitted)} sub={`${d.completionPct}%`} />
        <Stat label="Unfinished" value={String(d.inProgress)} sub={`${d.dropOffPct}%`} />
      </div>

      {!d.started ? (
        <p className="empty">Nobody has registered yet, so there is nothing to measure.</p>
      ) : (
        <>
          <h2>Question by question</h2>
          <p className="note">
            Each question is counted only against the people who were actually
            shown it. Someone who is not joining the church was never asked
            where they study, so it does not count as skipped for them.
          </p>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th className="n">Reached</th>
                  <th className="n">Answered</th>
                  <th className="n">Left blank</th>
                  <th className="n">Stopped here</th>
                  <th className="bar" />
                </tr>
              </thead>
              <tbody>
                {d.steps.map(s => (
                  <tr key={s.id}>
                    <td>
                      {s.label}
                      {s.optional && <span className="tag">optional</span>}
                    </td>
                    <td className="n">{s.reached}</td>
                    <td className="n">
                      {s.answered}
                      <em>{s.answeredPct}%</em>
                    </td>
                    <td className="n">
                      {s.blank ? (
                        <>
                          {s.blank}
                          <em>{s.blankPct}%</em>
                        </>
                      ) : (
                        <span className="zero">0</span>
                      )}
                    </td>
                    <td className="n">
                      {s.stopped ? (
                        <>
                          <strong className="drop">{s.stopped}</strong>
                          <em>{s.stoppedPct}%</em>
                        </>
                      ) : (
                        <span className="zero">0</span>
                      )}
                    </td>
                    <td className="bar">
                      {/* Reached is the full width, so the funnel narrowing is
                          visible down the column without reading the numbers. */}
                      <span
                        className="barfill"
                        style={{ width: `${d.started ? (s.reached / d.started) * 100 : 0}%` }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>What people choose</h2>
          <p className="note">
            Percentages are of the people who answered that question, not of
            everyone. Multi-answer questions add up to more than 100%.
          </p>

          <div className="optiongrid">
            {d.options.map(o => (
              <div className="optioncard" key={o.stepId}>
                <div className="optionhead">
                  {o.label}
                  <span>{o.base} answered</span>
                </div>
                {o.options.map(opt => (
                  <div className="optionrow" key={opt.value}>
                    <span className="olabel">{opt.label}</span>
                    <span className="obar">
                      <span className="obarfill" style={{ width: `${opt.pct}%` }} />
                    </span>
                    <span className="ocount">
                      {opt.count}
                      <em>{opt.pct}%</em>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="statlabel">{label}</div>
      <div className="statvalue">
        {value}
        {sub && <em>{sub}</em>}
      </div>
    </div>
  );
}
