import { Logo } from './Logo';

/** The mark and name, above every page someone reaches without signing in. */
export function Brand({ churchName = 'IRCA' }: { churchName?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={36} />
      <span className="flex flex-col leading-tight">
        <span className="text-[13.5px] font-semibold text-fg">{churchName}</span>
        <span className="text-[11.5px] text-fg3">Admin portal</span>
      </span>
    </div>
  );
}
