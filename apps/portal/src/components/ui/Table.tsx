import type { ReactNode } from 'react';

/** The design's table: quiet head, hairline rows, horizontal scroll on a phone. */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="bg-thead">
          <tr>
            {head.map((cell, i) => (
              <th
                key={i}
                scope="col"
                className="border-b border-border px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-fg3 uppercase"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={
        onClick
          ? 'cursor-pointer border-t border-border2 hover:bg-hover'
          : 'border-t border-border2'
      }
    >
      {children}
    </tr>
  );
}

export function Cell({ children, nowrap }: { children: ReactNode; nowrap?: boolean }) {
  return (
    <td className={`px-3 py-2.5 align-middle ${nowrap ? 'whitespace-nowrap' : ''}`}>{children}</td>
  );
}
