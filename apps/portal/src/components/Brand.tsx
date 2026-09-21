/** The mark and name from the design's sidebar. */
export function Brand({ churchName = 'IRCA' }: { churchName?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-[8px] bg-accent text-[14px] font-semibold text-accent-ink"
      >
        I
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13.5px] font-semibold text-fg">{churchName}</span>
        <span className="text-[11.5px] text-fg3">Admin portal</span>
      </span>
    </div>
  );
}
