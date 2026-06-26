/**
 * A single shared IntersectionObserver used to lazily render thumbnails/icons.
 * Each element's callback fires once when it first scrolls near the viewport,
 * then it's unobserved — so large folders don't do work for off-screen items.
 */
type Cb = () => void

const callbacks = new WeakMap<Element, Cb>()
let io: IntersectionObserver | null = null

function observer(): IntersectionObserver {
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const cb = callbacks.get(entry.target)
          if (cb) {
            callbacks.delete(entry.target)
            io!.unobserve(entry.target)
            cb()
          }
        }
      },
      // Prefetch a screen ahead so scrolling stays smooth.
      { rootMargin: '500px 0px' }
    )
  }
  return io
}

export function observeInView(el: Element, cb: Cb): () => void {
  callbacks.set(el, cb)
  observer().observe(el)
  return () => {
    callbacks.delete(el)
    observer().unobserve(el)
  }
}
