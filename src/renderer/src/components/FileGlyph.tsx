import React from 'react'
import type { FileKind } from '@shared/types'

interface FileGlyphProps {
  kind: FileKind
  ext?: string
  size?: number
  className?: string
}

/* Color + short label for the badge on the white "page" used by file kinds,
   a generic document-icon style (white sheet, folded corner,
   colored type tag). */
const KIND_BADGE: Partial<Record<FileKind, { color: string; label: string }>> = {
  image: { color: '#19a974', label: 'IMG' },
  video: { color: '#e8584c', label: 'VID' },
  audio: { color: '#a45cf2', label: 'AUD' },
  pdf: { color: '#e2453c', label: 'PDF' },
  document: { color: '#2b579a', label: 'DOC' },
  spreadsheet: { color: '#217346', label: 'XLS' },
  presentation: { color: '#d24726', label: 'PPT' },
  archive: { color: '#caa23a', label: 'ZIP' },
  code: { color: '#3b78c4', label: '<>' },
  text: { color: '#5a6b7b', label: 'TXT' },
  executable: { color: '#5a6b7b', label: 'EXE' },
  font: { color: '#6b4fb0', label: 'F' },
  'disk-image': { color: '#8a8f98', label: 'DMG' },
  file: { color: '#9aa3ad', label: '' }
}

const Page: React.FC<{ kind: FileKind; ext?: string }> = ({ kind, ext }) => {
  const badge = KIND_BADGE[kind] ?? KIND_BADGE.file!
  const label = ext ? ext.slice(0, 4).toUpperCase() : badge.label
  return (
    <>
      {/* sheet */}
      <path
        d="M8 3h11l7 7v18.2A1.8 1.8 0 0 1 24.2 30H8a1.8 1.8 0 0 1-1.8-1.8V4.8A1.8 1.8 0 0 1 8 3z"
        fill="#ffffff"
        stroke="#d9dde3"
        strokeWidth="1"
      />
      {/* folded corner */}
      <path d="M19 3l7 7h-5.4A1.6 1.6 0 0 1 19 8.4V3z" fill="#eef1f5" stroke="#d9dde3" strokeWidth="1" />
      {/* type badge */}
      <rect x="5.4" y="18.5" width="17" height="8.2" rx="1.6" fill={badge.color} />
      <text
        x="13.9"
        y="24.4"
        textAnchor="middle"
        fontSize={label.length > 3 ? 5.4 : 6.2}
        fontFamily="'Segoe UI', system-ui, sans-serif"
        fontWeight={700}
        fill="#ffffff"
        style={{ userSelect: 'none' }}
      >
        {label}
      </text>
    </>
  )
}

/** Colored glyph for a file/folder/drive of the given kind. */
export const FileGlyph: React.FC<FileGlyphProps> = ({ kind, ext, size = 32, className }) => {
  let content: React.ReactNode
  switch (kind) {
    case 'folder':
      content = (
        <>
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h7.2l2.4 2.6h13.4A1.5 1.5 0 0 1 29 11.1v3H3z" fill="#e3a823" />
          <path
            d="M3 12.6A1.6 1.6 0 0 1 4.6 11h22.8A1.6 1.6 0 0 1 29 12.6v12.8A1.6 1.6 0 0 1 27.4 27H4.6A1.6 1.6 0 0 1 3 25.4z"
            fill="#ffce5c"
          />
          <path
            d="M3 12.6A1.6 1.6 0 0 1 4.6 11h22.8A1.6 1.6 0 0 1 29 12.6v1.2H3z"
            fill="#ffd980"
          />
        </>
      )
      break
    case 'app':
      content = (
        <>
          <rect x="4" y="4" width="24" height="24" rx="5.5" fill="#0b6bcb" />
          <rect x="4" y="4" width="24" height="24" rx="5.5" fill="url(#appGrad)" />
          <path d="M11 22l5-12 5 12M12.7 18h6.6" stroke="#ffffff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <defs>
            <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.08" />
            </linearGradient>
          </defs>
        </>
      )
      break
    case 'drive':
      content = (
        <>
          <rect x="3" y="9" width="26" height="14" rx="2.6" fill="#cdd2da" />
          <rect x="3" y="9" width="26" height="6.5" rx="2.6" fill="#dfe3e9" />
          <circle cx="24.5" cy="16" r="1.5" fill="#19a974" />
        </>
      )
      break
    case 'image':
      content = (
        <>
          <rect x="4.5" y="6" width="23" height="20" rx="2.4" fill="#ffffff" stroke="#d9dde3" strokeWidth="1" />
          <circle cx="11" cy="12" r="2.1" fill="#f1b400" />
          <path d="M5.5 24l6.5-7 4.5 4.5 4-4 6 6.5v.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1z" fill="#19a974" />
        </>
      )
      break
    default:
      content = <Page kind={kind} ext={ext} />
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {content}
    </svg>
  )
}

export default FileGlyph
