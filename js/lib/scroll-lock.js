/** Prevent iOS rubber-band overscroll on a scrollport. */
export function lockScrollBounce(el) {
  if (!el || el._crcBounceLocked) return
  el._crcBounceLocked = true

  let startY = 0

  el.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) return
      startY = event.touches[0].clientY
    },
    { passive: true },
  )

  el.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 1) return

      const dy = event.touches[0].clientY - startY
      const { scrollTop, scrollHeight, clientHeight } = el
      const atTop = scrollTop <= 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1

      // Block the drag that would bounce past the edges
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        event.preventDefault()
      }
    },
    { passive: false },
  )
}
