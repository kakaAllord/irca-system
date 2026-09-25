/**
 * Everything that happened with a person, from every portal, oldest first
 * (D23): the doorstep, the calls, the visits, the first Sunday, the class and
 * the membership. Used by the Membership person page and by Outreach, from
 * the same API function, so the two can never tell it differently.
 */

export type TimelineLine = {
  id: string;
  kind: string;
  at: string;
  portal: string;
  by: string | null;
  summary: string;
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function Timeline({ lines }: { lines: TimelineLine[] }) {
  if (lines.length === 0) {
    return <p className="text-[12.5px] text-fg3">Nothing recorded yet.</p>;
  }
  return (
    <ol className="flex flex-col text-[12.5px]">
      {lines.map((line) => (
        <li
          key={line.id}
          className="grid grid-cols-[88px_1fr] gap-x-3 border-t border-border2 py-2 first:border-0 first:pt-0 sm:grid-cols-[100px_1fr_auto]"
        >
          <span className="text-fg3 tabular-nums">{date(line.at)}</span>
          <span className="flex flex-col">
            <span className="text-fg">{line.summary}</span>
            {line.by && <span className="text-[11.5px] text-fg3">{line.by}</span>}
          </span>
          <span className="col-start-2 text-[11px] text-fg3 sm:col-start-3 sm:text-right">
            {line.portal}
          </span>
        </li>
      ))}
    </ol>
  );
}
