import { useEffect, useMemo, useState } from 'react'
import { easeOutCubic, interpolateFrame, NOTHING_ENTERING, RELAYOUT_MS } from './relayout'
import type { CanvasFrame, TweenFrame } from './relayout'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function reducedMotionQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null
}

/** Live value of the user's `prefers-reduced-motion: reduce` setting. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => reducedMotionQuery()?.matches ?? false)
  useEffect(() => {
    const query = reducedMotionQuery()
    if (query === null) return
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

interface Tween {
  /** Where the running animation started; `null` when settled on `to`. */
  from: CanvasFrame | null
  to: CanvasFrame
  resetKey: unknown
  /** Linear progress 0–1. */
  progress: number
}

function displayed(tween: Tween): CanvasFrame {
  return tween.from === null ? tween.to : interpolateFrame(tween.from, tween.to, easeOutCubic(tween.progress))
}

/**
 * Animates the flow canvas between layouts (OPS-583).
 *
 * Whenever `target.layout` changes, the returned frame eases from what was on
 * screen to the new layout over `duration` ms — cards, scene boxes, links and
 * the view together, so a view adjusted for the new layout (anchoring) moves
 * in step with the cards.  A view change on its own (pan, zoom) is shown
 * immediately, or retargets a running animation.
 *
 * No animation: on the first render, when `resetKey` changes (another
 * adventure), and while the user prefers reduced motion.
 */
export function useRelayoutTween(
  target: CanvasFrame,
  resetKey: unknown,
  duration = RELAYOUT_MS,
): TweenFrame {
  const reduced = usePrefersReducedMotion()
  const [tween, setTween] = useState<Tween>(() => ({ from: null, to: target, resetKey, progress: 1 }))

  let current = tween
  const { to } = tween
  if (
    to.layout !== target.layout ||
    to.links !== target.links ||
    to.view !== target.view ||
    tween.resetKey !== resetKey
  ) {
    const animating = tween.from !== null
    if (tween.resetKey !== resetKey || reduced || duration <= 0) {
      current = { from: null, to: target, resetKey, progress: 1 }
    } else if (to.layout !== target.layout) {
      current = { from: displayed(tween), to: target, resetKey, progress: 0 }
    } else if (animating) {
      current = { ...tween, to: target }
    } else {
      current = { from: null, to: target, resetKey, progress: 1 }
    }
    setTween(current)
  }

  const { from } = current
  useEffect(() => {
    if (from === null) return
    let start: number | null = null
    let frame = requestAnimationFrame(function step(now) {
      start ??= now
      const progress = Math.min(1, (now - start) / duration)
      setTween((t) => (t.from !== from ? t : progress >= 1
        ? { ...t, from: null, progress: 1 }
        : { ...t, progress }))
      if (progress < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [from, duration])

  return useMemo<TweenFrame>(
    () => current.from === null
      ? { ...current.to, entering: NOTHING_ENTERING, enterOpacity: 1 }
      : interpolateFrame(current.from, current.to, easeOutCubic(current.progress)),
    [current],
  )
}
