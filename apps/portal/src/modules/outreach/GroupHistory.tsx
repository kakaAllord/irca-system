import type { PartnerGroup } from './types';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Who has been in a partner group, from when until when. Partnerships change
 * whenever the team decides; who went out with whom is kept (owner, 25 Sept
 * 2026).
 */
export function GroupHistory({ group }: { group: PartnerGroup }) {
  if (group.history.length === 0) return null;
  return (
    <details className="text-[11.5px]">
      <summary className="cursor-pointer text-fg3">Who has been in it</summary>
      <ul className="mt-1.5 flex flex-col gap-0.5">
        {group.history.map((h, i) => (
          <li key={`${h.personId}-${i}`} className="text-fg2">
            {h.name}{' '}
            <span className="text-fg3">
              {h.to ? `${date(h.from)} to ${date(h.to)}` : `since ${date(h.from)}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
