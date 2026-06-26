import React from 'react'

export type IconName =
  | 'back'
  | 'forward'
  | 'up'
  | 'refresh'
  | 'new'
  | 'newFolder'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'rename'
  | 'share'
  | 'delete'
  | 'sort'
  | 'layout'
  | 'filter'
  | 'more'
  | 'chevronDown'
  | 'chevronRight'
  | 'chevronLeft'
  | 'search'
  | 'check'
  | 'bullet'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'close'
  | 'add'
  | 'home'
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'pictures'
  | 'music'
  | 'videos'
  | 'applications'
  | 'drive'
  | 'thisPC'
  | 'star'
  | 'clock'
  | 'eye'
  | 'info'
  | 'undo'
  | 'group'
  | 'details'
  | 'gridLarge'
  | 'gridMedium'
  | 'gridSmall'
  | 'list'
  | 'tiles'
  | 'extraLarge'
  | 'lock'

interface IconProps {
  name: IconName
  size?: number
  className?: string
  style?: React.CSSProperties
  strokeWidth?: number
}

/* Monochrome line-style glyphs on a 16x16 grid, drawn with currentColor.
   A mix of stroked and filled paths keeps them crisp at small sizes. */
const PATHS: Record<IconName, React.ReactNode> = {
  back: <path d="M9.5 3L4.5 8l5 5" />,
  forward: <path d="M6.5 3l5 5-5 5" />,
  up: <path d="M3.5 7.5L8 3l4.5 4.5M8 3.4V13" />,
  chevronLeft: <path d="M10 3.5L5.5 8l4.5 4.5" />,
  chevronRight: <path d="M6 3.5L10.5 8 6 12.5" />,
  chevronDown: <path d="M3.5 6L8 10.5 12.5 6" />,
  refresh: (
    <path d="M12.5 4.5A5 5 0 1 0 13 8M12.5 2.5v2.2h-2.2" />
  ),
  new: <path d="M8 3.5v9M3.5 8h9" />,
  add: <path d="M8 3.5v9M3.5 8h9" />,
  newFolder: (
    <>
      <path d="M1.8 4.2h3.6l1.2 1.4h6.6a.6.6 0 0 1 .6.6v6.0a.6.6 0 0 1-.6.6H1.8a.6.6 0 0 1-.6-.6V4.8a.6.6 0 0 1 .6-.6z" />
      <path d="M11.5 7.5v3M10 9h3" />
    </>
  ),
  cut: (
    <>
      <circle cx="4" cy="11.5" r="1.8" />
      <circle cx="12" cy="11.5" r="1.8" />
      <path d="M5.3 10.2L13 2.5M3 2.5l7.7 7.7" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M3.5 10.5h-.6a.9.9 0 0 1-.9-.9V3.4a.9.9 0 0 1 .9-.9h6.2a.9.9 0 0 1 .9.9v.6" />
    </>
  ),
  paste: (
    <>
      <rect x="3" y="3.2" width="10" height="11" rx="1.2" />
      <rect x="5.6" y="1.8" width="4.8" height="2.6" rx="0.8" />
    </>
  ),
  rename: <path d="M10.5 3.2l2.3 2.3-7 7-2.8.5.5-2.8 7-7zM9.3 4.4l2.3 2.3" />,
  share: (
    <>
      <circle cx="12" cy="3.8" r="1.9" />
      <circle cx="4" cy="8" r="1.9" />
      <circle cx="12" cy="12.2" r="1.9" />
      <path d="M10.3 4.8L5.7 7M5.7 9l4.6 2.2" />
    </>
  ),
  delete: (
    <>
      <path d="M3 4.5h10M6 4.5V3h4v1.5M4.3 4.5l.6 8.4a.7.7 0 0 0 .7.6h4.8a.7.7 0 0 0 .7-.6l.6-8.4" />
      <path d="M6.6 6.8v4.2M9.4 6.8v4.2" />
    </>
  ),
  sort: <path d="M3 4.5h10M4.5 8h7M6.5 11.5h3" />,
  filter: <path d="M2.5 3.5h11l-4.3 5v4l-2.4 1.3V8.5z" />,
  group: (
    <>
      <rect x="2.5" y="3" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="3" width="4.5" height="4.5" rx="0.8" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.8" />
    </>
  ),
  layout: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <path d="M6.2 3v10M2.5 6.5h3.7" />
    </>
  ),
  more: (
    <>
      <circle cx="3.5" cy="8" r="1.1" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="12.5" cy="8" r="1.1" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3.2 3.2" />
    </>
  ),
  check: <path d="M3.5 8.4l3 3 6-6.5" />,
  bullet: <circle cx="8" cy="8" r="2.4" />,
  minimize: <path d="M3 8h10" />,
  maximize: <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1" />,
  restore: (
    <>
      <rect x="3" y="4.6" width="7.4" height="7.4" rx="1" />
      <path d="M5.4 4.6V3.4a.8.8 0 0 1 .8-.8h6a.8.8 0 0 1 .8.8v6a.8.8 0 0 1-.8.8h-1.2" />
    </>
  ),
  close: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  home: <path d="M2.5 7.7L8 3l5.5 4.7M3.8 6.6V13h8.4V6.6" />,
  desktop: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M5.5 13.5h5M8 11v2.5" />
    </>
  ),
  documents: (
    <>
      <path d="M4 1.8h5l3 3v9a.6.6 0 0 1-.6.6H4a.6.6 0 0 1-.6-.6V2.4A.6.6 0 0 1 4 1.8z" />
      <path d="M9 1.8v3.2h3" />
    </>
  ),
  downloads: <path d="M8 2.5v7.5M5 7l3 3 3-3M3.5 13h9" />,
  pictures: (
    <>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1" />
      <circle cx="5.7" cy="6.3" r="1.1" />
      <path d="M2.6 11l3.2-3 2.4 2.2 2.3-2.4 2.9 3" />
    </>
  ),
  music: <path d="M6 11.5V4l6-1.3v7.3M6 11.5a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0zM12 9.3a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0z" />,
  videos: (
    <>
      <rect x="2" y="3.5" width="9" height="9" rx="1" />
      <path d="M11 7l3-2v6l-3-2z" />
    </>
  ),
  applications: (
    <>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </>
  ),
  drive: (
    <>
      <rect x="2" y="5" width="12" height="6.5" rx="1.2" />
      <circle cx="11.3" cy="8.25" r="0.8" />
    </>
  ),
  thisPC: (
    <>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M5.5 13.5h5M8 11v2.5" />
    </>
  ),
  star: <path d="M8 2.3l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.5 4.4 13.4l.7-4L2.2 6.6l4-.6z" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 4.6V8l2.4 1.6" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 7.2v3.4M8 5.2v.1" />
    </>
  ),
  undo: <path d="M5.5 5.5L2.8 8l2.7 2.5M3 8h6.5a3.5 3.5 0 0 1 0 7H7" />,
  details: <path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5M2.5 4.5h.01M2.5 8h.01M2.5 11.5h.01" />,
  list: <path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5M2.6 4.5h.8M2.6 8h.8M2.6 11.5h.8" />,
  gridLarge: (
    <>
      <rect x="2.5" y="2.5" width="5" height="5" rx="0.8" />
      <rect x="8.5" y="2.5" width="5" height="5" rx="0.8" />
      <rect x="2.5" y="8.5" width="5" height="5" rx="0.8" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="0.8" />
    </>
  ),
  gridMedium: (
    <>
      <rect x="2.5" y="2.5" width="4" height="4" rx="0.7" />
      <rect x="9.5" y="2.5" width="4" height="4" rx="0.7" />
      <rect x="2.5" y="9.5" width="4" height="4" rx="0.7" />
      <rect x="9.5" y="9.5" width="4" height="4" rx="0.7" />
    </>
  ),
  gridSmall: (
    <>
      <rect x="2.5" y="2.5" width="2.8" height="2.8" rx="0.5" />
      <rect x="6.6" y="2.5" width="2.8" height="2.8" rx="0.5" />
      <rect x="10.7" y="2.5" width="2.8" height="2.8" rx="0.5" />
      <rect x="2.5" y="6.6" width="2.8" height="2.8" rx="0.5" />
      <rect x="6.6" y="6.6" width="2.8" height="2.8" rx="0.5" />
      <rect x="10.7" y="6.6" width="2.8" height="2.8" rx="0.5" />
    </>
  ),
  extraLarge: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    </>
  ),
  tiles: (
    <>
      <rect x="2.5" y="3" width="4" height="4" rx="0.7" />
      <rect x="2.5" y="9" width="4" height="4" rx="0.7" />
      <path d="M8 4h5.5M8 6h3.5M8 10h5.5M8 12h3.5" />
    </>
  ),
  lock: (
    <>
      <path d="M5 7V5.1a3 3 0 0 1 6 0V7" />
      <rect x="3.4" y="7" width="9.2" height="6.6" rx="1.4" />
      <path d="M8 9.6v2.2" />
    </>
  )
}

// Glyphs that read better as solid fills than strokes.
const FILLED = new Set<IconName>(['filter', 'star', 'bullet'])

export const Icon: React.FC<IconProps> = ({ name, size = 16, className, style, strokeWidth = 1.1 }) => {
  const filled = FILLED.has(name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export default Icon
