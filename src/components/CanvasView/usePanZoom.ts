import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'

// ---------------------------------------------------------------------------
// Pure view maths (exported for direct unit testing)
// ---------------------------------------------------------------------------

/** Canvas transform: content point p appears at screen point p × zoom + (x, y). */
export interface View {
  zoom: number
  x: number
  y: number
}

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2.5
/** Multiplicative zoom step for buttons and one wheel notch. */
export const ZOOM_STEP = 1.2
/** Margin kept around the content by "Reset view" and "Fit to view". */
export const VIEW_MARGIN = 16

export const INITIAL_VIEW: View = { zoom: 1, x: VIEW_MARGIN, y: VIEW_MARGIN }

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** Zooms by `factor`, keeping the screen point (px, py) fixed. */
export function zoomAround(view: View, factor: number, px: number, py: number): View {
  const zoom = clampZoom(view.zoom * factor)
  const k = zoom / view.zoom
  return { zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k }
}

/**
 * The view that shows all of a `width` × `height` canvas, never above 100%.
 * If even the minimum zoom cannot fit it, the canvas is aligned to the
 * top-left margin (where the story starts) rather than centred off-screen.
 */
export function fitView(width: number, height: number, viewportW: number, viewportH: number): View {
  if (width <= 0 || height <= 0 || viewportW <= 0 || viewportH <= 0) return INITIAL_VIEW
  const zoom = clampZoom(Math.min(
    (viewportW - 2 * VIEW_MARGIN) / width,
    (viewportH - 2 * VIEW_MARGIN) / height,
    1,
  ))
  const place = (size: number, viewport: number) =>
    Math.max(VIEW_MARGIN, (viewport - size * zoom) / 2)
  return { zoom, x: place(width, viewportW), y: place(height, viewportH) }
}

/**
 * The opening view of an adventure: 100% zoom, content flush left (with the
 * margin) and content height `cy` at the viewport's vertical middle — so the
 * start node is visible on the left however tall its scene is.
 */
export function startView(cy: number, viewportH: number): View {
  return { zoom: 1, x: VIEW_MARGIN, y: viewportH / 2 - cy }
}

/** Keeps the zoom and pans so content point (cx, cy) sits mid-viewport. */
export function centreView(view: View, cx: number, cy: number, viewportW: number, viewportH: number): View {
  return { zoom: view.zoom, x: viewportW / 2 - cx * view.zoom, y: viewportH / 2 - cy * view.zoom }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Pointer travel (px) below which a press-and-release counts as a click. */
const CLICK_TOLERANCE = 4

export interface PanZoom {
  view: View
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  /** Fits a canvas of the given size into the viewport. */
  fit: (width: number, height: number) => void
  /** Pans so content point (cx, cy) is centred, keeping the zoom. */
  centreOn: (cx: number, cy: number) => void
  /**
   * Shows the opening view (see `startView`) for content height `cy`.
   * Returns false, changing nothing, while the viewport is unmeasured.
   */
  showStart: (cy: number) => boolean
  /** Spread onto the viewport element to enable drag-to-pan. */
  pointerHandlers: {
    onPointerDown: (e: PointerEvent<HTMLElement>) => void
    onPointerMove: (e: PointerEvent<HTMLElement>) => void
    onPointerUp: (e: PointerEvent<HTMLElement>) => void
    onPointerCancel: () => void
  }
}

/**
 * Pan and zoom for the flow canvas viewport.
 *
 * - Mouse wheel zooms around the cursor.  React registers wheel listeners as
 *   passive, so a native non-passive listener is attached to call
 *   `preventDefault()` and stop the page scrolling (OPS-568).
 * - Dragging on empty canvas pans; presses on buttons are left alone.
 * - A press-and-release on empty canvas without dragging calls `onEmptyClick`.
 *
 * `viewportRef` must point at the element the content is transformed within.
 * `enabled` re-attaches the wheel listener once that element is mounted.
 */
export function usePanZoom(
  viewportRef: RefObject<HTMLElement | null>,
  onEmptyClick: () => void,
  enabled: boolean,
): PanZoom {
  const [view, setView] = useState<View>(INITIAL_VIEW)
  const drag = useRef<{ x: number; y: number; travelled: number } | null>(null)

  const viewportSize = useCallback((): [number, number] => {
    const el = viewportRef.current
    return el === null ? [0, 0] : [el.clientWidth, el.clientHeight]
  }, [viewportRef])

  useEffect(() => {
    const el = viewportRef.current
    if (!enabled || el === null) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      setView((v) => zoomAround(v, factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [viewportRef, enabled])

  const zoomBy = useCallback((factor: number) => {
    const [w, h] = viewportSize()
    setView((v) => zoomAround(v, factor, w / 2, h / 2))
  }, [viewportSize])

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy])
  const reset = useCallback(() => setView(INITIAL_VIEW), [])

  const fit = useCallback((width: number, height: number) => {
    const [w, h] = viewportSize()
    setView(fitView(width, height, w, h))
  }, [viewportSize])

  const centreOn = useCallback((cx: number, cy: number) => {
    const [w, h] = viewportSize()
    setView((v) => centreView(v, cx, cy, w, h))
  }, [viewportSize])

  const showStart = useCallback((cy: number) => {
    const [, h] = viewportSize()
    if (h === 0) return false
    setView(startView(cy, h))
    return true
  }, [viewportSize])

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button') !== null) return
    drag.current = { x: e.clientX, y: e.clientY, travelled: 0 }
  }, [])

  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (d === null) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    drag.current = { x: e.clientX, y: e.clientY, travelled: d.travelled + Math.abs(dx) + Math.abs(dy) }
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }, [])

  const onPointerUp = useCallback(() => {
    const d = drag.current
    drag.current = null
    if (d !== null && d.travelled < CLICK_TOLERANCE) onEmptyClick()
  }, [onEmptyClick])

  const onPointerCancel = useCallback(() => {
    drag.current = null
  }, [])

  return {
    view,
    zoomIn,
    zoomOut,
    reset,
    fit,
    centreOn,
    showStart,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}
