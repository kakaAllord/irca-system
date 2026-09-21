'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Can } from '@/lib/session';

const PRESETS = ['This month', 'Last month', 'This quarter', 'This year', 'Last year'] as const;

/** Presets for the ranges people actually ask for, and two dates for the rest. */
export function RangePicker({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const go = (next: { from: string; to: string }) =>
    router.replace(`/finance/reports?from=${next.from}&to=${next.to}`, { scroll: false });

  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((preset) => (
        <Button key={preset} size="sm" variant="secondary" onClick={() => go(rangeOf(preset))}>
          {preset}
        </Button>
      ))}
      <Input
        label="From"
        type="date"
        value={from}
        onChange={(e) => go({ from: e.target.value, to })}
      />
      <Input label="To" type="date" value={to} onChange={(e) => go({ from, to: e.target.value })} />
    </div>
  );
}

export function PrintButton({ from, to }: { from: string; to: string }) {
  return (
    <>
      <Can permission="finance.reports.read">
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = `/api/finance/reports/statement.csv?from=${from}&to=${to}`;
          }}
        >
          Download CSV
        </Button>
      </Can>
      <Button onClick={() => window.print()}>Print</Button>
    </>
  );
}

function rangeOf(preset: (typeof PRESETS)[number]): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  switch (preset) {
    case 'Last month':
      return {
        from: day(new Date(Date.UTC(year, month - 1, 1))),
        to: day(new Date(Date.UTC(year, month, 0))),
      };
    case 'This quarter': {
      const first = Math.floor(month / 3) * 3;
      return {
        from: day(new Date(Date.UTC(year, first, 1))),
        to: day(new Date(Date.UTC(year, first + 3, 0))),
      };
    }
    case 'This year':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    case 'Last year':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    default:
      return {
        from: day(new Date(Date.UTC(year, month, 1))),
        to: day(new Date(Date.UTC(year, month + 1, 0))),
      };
  }
}
