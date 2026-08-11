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
   * Neither value ever crops or stretches — the image always keeps its own
   * aspect ratio. They differ only in the box it sits in:
   *
   * - 'square' (default) reserves a fixed size×size cell and letterboxes the
   *   image inside it, so grid and list rows stay aligned.
   * - 'intrinsic' lets the box shrink to the image's own shape, bounded by
   *   `size`. For the preview pane, where the picture is the content.
   */
  frame?: 'square' | 'intrinsic'
}

// Kinds the OS thumbnailer can preview meaningfully.
const THUMB_KINDS = new Set<FileKind>(['image', 'video', 'pdf'])

/**
 * Shows a real OS thumbnail for previewable files, otherwise the kind glyph.
 * The glyph/thumbnail is only created once the element scrolls into view, so a
 * folder with thousands of files doesn't build thousands of SVGs / fire
 * thousands of thumbnail requests up front.
 */
const ThumbnailImpl: React.FC<ThumbnailProps> = ({
  item,
  size,
  className,
  frame = 'square'
}) => {
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
        // 'square' reserves the cell so rows stay aligned; 'intrinsic' shrinks
        // to whatever shape the image turns out to be.
        ...(frame === 'intrinsic'
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
          draggable={false}
          style={{
            // Bounded by the box and never given both dimensions, so the image
            // is only ever scaled down — never cropped, never stretched.
            maxWidth: frame === 'intrinsic' ? size : '100%',
            maxHeight: frame === 'intrinsic' ? size : '100%',
            width: 'auto',
            height: 'auto',
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
