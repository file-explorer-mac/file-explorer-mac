import React, { useEffect, useRef, useState } from 'react'
import type { FileItem, FileKind } from '@shared/types'
import { FileGlyph } from '@/components/FileGlyph'
import { cachedThumbnail, loadThumbnail } from '@/utils/thumbnails'
import { observeInView } from '@/utils/inView'

interface ThumbnailProps {
  item: FileItem
  size: number
  className?: string
  /**
   * 'cover' crops to a square, which is what the uniform grid/list cells want.
   * 'contain' keeps the image's own aspect ratio — use it wherever the picture
   * itself is the point, like the preview pane.
   */
  fit?: 'cover' | 'contain'
}

// Kinds the OS thumbnailer can preview meaningfully.
const THUMB_KINDS = new Set<FileKind>(['image', 'video', 'pdf'])

/**
 * Shows a real OS thumbnail for previewable files, otherwise the kind glyph.
 * The glyph/thumbnail is only created once the element scrolls into view, so a
 * folder with thousands of files doesn't build thousands of SVGs / fire
 * thousands of thumbnail requests up front.
 */
const ThumbnailImpl: React.FC<ThumbnailProps> = ({ item, size, className, fit = 'cover' }) => {
  const wantThumb = THUMB_KINDS.has(item.kind)
  const ref = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(false)
  const [src, setSrc] = useState<string | null>(() =>
    wantThumb ? cachedThumbnail(item.path, item.modified) ?? null : null
  )

  // Reveal once the element is near the viewport (observe only until then).
  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    return observeInView(el, () => setInView(true))
  }, [inView])

  // Fetch the thumbnail only after it's visible.
  useEffect(() => {
    if (!wantThumb || !inView) return
    const cached = cachedThumbnail(item.path, item.modified)
    if (cached !== undefined) {
      setSrc(cached)
      return
    }
    let alive = true
    void loadThumbnail(item.path, item.modified).then((value) => {
      if (alive) setSrc(value)
    })
    return () => {
      alive = false
    }
  }, [wantThumb, inView, item.path, item.modified])

  return (
    <span
      ref={ref}
      className={className}
      style={{
        // A fixed square keeps grid/list cells uniform; 'contain' must be free
        // to shrink to the image's ratio instead.
        ...(fit === 'contain'
          ? { maxWidth: size, maxHeight: size }
          : { width: size, height: size }),
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {!inView ? null : wantThumb && src ? (
        <img
          src={src}
          alt=""
          // Fixed intrinsic size reserves the cell before the image decodes;
          // 'contain' has to stay free to size itself.
          width={fit === 'contain' ? undefined : size}
          height={fit === 'contain' ? undefined : size}
          draggable={false}
          style={{
            // 'contain' sizes to the image's own ratio inside the box; 'cover'
            // fills a fixed square and crops.
            ...(fit === 'contain'
              ? { maxWidth: size, maxHeight: size, width: 'auto', height: 'auto' }
              : { width: size, height: size, objectFit: 'cover' as const }),
            borderRadius: 2,
            display: 'block',
            background: 'var(--control-hover)'
          }}
        />
      ) : (
        <FileGlyph kind={item.kind} ext={item.ext} size={size} />
      )}
    </span>
  )
}

export const Thumbnail = React.memo(ThumbnailImpl)
Thumbnail.displayName = 'Thumbnail'

export default Thumbnail
