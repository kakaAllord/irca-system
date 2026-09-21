/**
 * The icons, drawn rather than typed.
 *
 * Every one of these used to be a character — an arrow, a tick, a padlock, a
 * birthday cake. Two problems with that. A glyph is only as good as the font
 * behind it, and on the cheap Android handsets this form is filled in on,
 * plenty of them are missing: a missing glyph draws an empty box exactly where
 * the affordance should be. And an emoji is a picture from somebody else's set,
 * so it arrives at whatever size, weight and colour that vendor chose, next to
 * text set in ours.
 *
 * These are paths. They take their colour from `currentColor` and their size
 * from the caller, so they sit at the weight of the text beside them.
 */

type Props = { size?: number; className?: string };

function Svg({ size = 20, className, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ArrowLeft = (p: Props) => (
  <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>
);

export const ArrowRight = (p: Props) => (
  <Svg {...p}><path d="M5 12h14M12 5l7 7-7 7" /></Svg>
);

export const Check = (p: Props) => (
  <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>
);

export const ChevronDown = (p: Props) => (
  <Svg {...p}><path d="M6 9.5l6 6 6-6" /></Svg>
);

export const Plus = (p: Props) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const Minus = (p: Props) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);

/** Beside the note saying who reads a prayer request. */
export const Lock = (p: Props) => (
  <Svg {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2.5" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);

/** On the button that opens the date of birth picker. */
export const Calendar = (p: Props) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
