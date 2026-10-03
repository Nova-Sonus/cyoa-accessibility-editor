import { describe, it, expect } from 'vitest'
import {
  clampZoom, zoomAround, fitView, centreView, startView,
  INITIAL_VIEW, MIN_ZOOM, MAX_ZOOM, VIEW_MARGIN,
} from './usePanZoom'

describe('startView', () => {
  it('shows content at 100%, flush left, with the given height mid-viewport', () => {
    expect(startView(500, 600)).toEqual({ zoom: 1, x: VIEW_MARGIN, y: -200 })
  })
})

describe('clampZoom', () => {
  it('keeps zoom between the minimum and maximum', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(10)).toBe(MAX_ZOOM)
    expect(clampZoom(1.3)).toBe(1.3)
  })
})

describe('zoomAround', () => {
  it('keeps the given screen point over the same content point', () => {
    const before = { zoom: 1, x: 10, y: 20 }
    const after = zoomAround(before, 2, 110, 120)
    // Content under (110, 120) was (100, 100); it must still be under it.
    expect(after.zoom).toBe(2)
    expect(100 * after.zoom + after.x).toBe(110)
    expect(100 * after.zoom + after.y).toBe(120)
  })

  it('does not move when the zoom is already at its limit', () => {
    const atMax = { zoom: MAX_ZOOM, x: 5, y: 5 }
    expect(zoomAround(atMax, 2, 100, 100)).toEqual(atMax)
  })
})

describe('fitView', () => {
  it('returns the initial view for an empty canvas or an unmeasured viewport', () => {
    expect(fitView(0, 100, 800, 600)).toEqual(INITIAL_VIEW)
    expect(fitView(100, 100, 0, 0)).toEqual(INITIAL_VIEW)
  })

  it('shrinks a large canvas to fit and centres it', () => {
    const view = fitView(2000, 400, 1032, 600)
    expect(view.zoom).toBe((1032 - 2 * VIEW_MARGIN) / 2000)
    expect(view.x).toBe((1032 - 2000 * view.zoom) / 2)
    expect(view.y).toBe((600 - 400 * view.zoom) / 2)
  })

  it('aligns a canvas too large even at minimum zoom to the top-left margin', () => {
    const view = fitView(20000, 400, 1000, 600)
    expect(view.zoom).toBe(MIN_ZOOM)
    expect(view.x).toBe(VIEW_MARGIN)
    expect(view.y).toBe((600 - 400 * MIN_ZOOM) / 2)
  })

  it('never zooms a small canvas beyond 100%', () => {
    expect(fitView(100, 100, 800, 600).zoom).toBe(1)
  })
})

describe('centreView', () => {
  it('pans the content point to the middle of the viewport, keeping the zoom', () => {
    const view = centreView({ zoom: 2, x: 0, y: 0 }, 50, 40, 400, 300)
    expect(view.zoom).toBe(2)
    expect(50 * view.zoom + view.x).toBe(200)
    expect(40 * view.zoom + view.y).toBe(150)
  })
})
