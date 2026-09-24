import type { NavIcon as Name } from '@irca/shared';

/**
 * The sidebar's drawings.
 *
 * Hand-drawn rather than a library: there are a dozen of them, they are all
 * the same weight and grid, and a page of the portal should not carry an icon
 * package to show twelve outlines. A module names the one it wants
 * (`icon: 'reports'`), and a name nothing here draws does not compile.
 */
export function NavIcon({ name, size = 14 }: { name: Name; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<Name, React.ReactNode> = {
  // A house: where a portal starts.
  dashboard: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.3V20h13V9.3" />
      <path d="M9.8 20v-5.4h4.4V20" />
    </>
  ),
  // A form with a tick: someone asking to join.
  applications: (
    <>
      <path d="M6 3h9l4 4v14H6Z" />
      <path d="M14 3v4h4" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  // Footsteps, one after another: the foundation class.
  discipleship: (
    <>
      <path d="M12 21V3" />
      <path d="M12 7H8.5a2.5 2.5 0 0 1 0-5H12M12 13h3.5a2.5 2.5 0 0 0 0-5H12" />
      <circle cx="12" cy="18.5" r="2" />
    </>
  ),
  // A rising line: what the form tells you.
  insights: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-5 3.5 3L20 7" />
    </>
  ),
  // Bars: how the month went.
  overview: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  // A receipt with its torn edge.
  transactions: (
    <>
      <path d="M5 3h14v18l-2.3-1.6-2.3 1.6-2.4-1.6L9.6 21l-2.3-1.6L5 21Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  // A list with its bullets.
  lists: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  // An in-tray: what is waiting for someone.
  requests: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13l2.5 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" />
    </>
  ),
  // A sheet with lines: the statement.
  reports: (
    <>
      <path d="M6 2h8l4 4v16H6Z" />
      <path d="M14 2v4h4M9.5 12h5M9.5 16h5" />
    </>
  ),
  // Two people.
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1M17.5 14.4c2.1.7 3.5 2.4 3.5 4.6" />
    </>
  ),
  // A key: what someone is allowed to open.
  roles: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8M16.5 16.5l2-2M14 14l2-2" />
    </>
  ),
  // Four panels: the portals a church has.
  portals: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // A clock turned back: what has happened.
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  // A building with a cross: the churches on the platform.
  // A prompt: the dev console.
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" />
    </>
  ),
  // A pulse.
  health: <path d="M2 12h4l2.5-6 4 13L15.5 12H22" />,
};
