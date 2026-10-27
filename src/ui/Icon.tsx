import type { ReactElement } from 'react';

const P = (d: string) => <path d={d} />;

const ICONS = {
  home: <>{P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z')}</>,
  schedule: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      {P('M3 10h18M8 3v4M16 3v4M7.5 14h3M7.5 17.5h6')}
    </>
  ),
  tasks: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      {P('M8 12.5l2.8 2.8L16.5 9')}
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      {P('M3 10h18M8 3v4M16 3v4')}
      <circle cx="8" cy="14.5" r="0.6" />
      <circle cx="12" cy="14.5" r="0.6" />
      <circle cx="16" cy="14.5" r="0.6" />
      <circle cx="8" cy="18" r="0.6" />
      <circle cx="12" cy="18" r="0.6" />
    </>
  ),
  more: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      {P('M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5')}
    </>
  ),
  plus: P('M12 5v14M5 12h14'),
  back: P('M15 5l-7 7 7 7'),
  forward: P('M9 5l7 7-7 7'),
  down: P('M6 9l6 6 6-6'),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      {P('M20 20l-3.6-3.6')}
    </>
  ),
  filter: P('M4 6h16M7 12h10M10 18h4'),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M12 7v5l3.2 2')}
    </>
  ),
  pin: (
    <>
      {P('M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z')}
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  trash: P('M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5'),
  edit: P('M4 20h4.2L19 9.2 14.8 5 4 15.8zM13 6.8l4.2 4.2'),
  check: P('M5 12.5l4.5 4.5L19 7.5'),
  x: P('M6 6l12 12M18 6 6 18'),
  download: P('M12 4v11M7 10l5 5 5-5M5 20h14'),
  upload: P('M12 16V5M7 10l5-5 5 5M5 20h14'),
  share: P('M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'),
  bell: (
    <>
      {P('M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z')}
      {P('M10 20.5a2.2 2.2 0 0 0 4 0')}
    </>
  ),
  book: P('M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2.5" />
      {P('M3 10.5h18M7 6V4.5h10V6')}
      <circle cx="16.5" cy="15" r="1.1" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="9" r="5.5" />
      {P('M8.6 13.4 7 21.5l5-2.8 5 2.8-1.6-8.1')}
    </>
  ),
  chart: P('M4 20V11M10 20V5M16 20v-6M2.5 20.5h19'),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      {P('M2 20.5c0-3.6 3-5.8 7-5.8s7 2.2 7 5.8M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.4.7 4 2.6 4 5.7')}
    </>
  ),
  moon: P('M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z'),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M12 11v6M12 7.6v.4')}
    </>
  ),
  alert: P('M12 3.5 2.5 20h19zM12 10v4.5M12 17.2v.3'),
  link: P('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2'),
  flag: P('M5 21V4h11.5l-2 4 2 4H5'),
  circle: <circle cx="12" cy="12" r="9" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M8 12.3l2.8 2.8L16.2 9.6')}
    </>
  ),
  repeat: P('M17 2.5l3 3-3 3M4 11V9.5a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3M20 13v1.5a4 4 0 0 1-4 4H4'),
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      {P('M10.5 18.5h3')}
    </>
  ),
  data: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      {P('M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3')}
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      {P('M16 10.5l5-3v9l-5-3')}
    </>
  ),
  layers: P('M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5'),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      {P('M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4')}
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M5.6 5.6l12.8 12.8')}
    </>
  ),
  swap: P('M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7'),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.5" cy="12" r="1.3" />
    </>
  ),
  file: P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6'),
  logout: P('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11'),
  refresh: P('M20 11a8 8 0 0 0-14.3-4.8L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.8L20 16M20 20v-4h-4'),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
