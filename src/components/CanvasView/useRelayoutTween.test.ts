import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { CanvasLayout } from './sceneLayout'
import type { NodeBox } from './treeLayout'
import type { View } from './usePanZoom'
import type { CanvasFrame } from './relayout'
import { easeOutCubic } from './relayout'
import { usePrefersReducedMotion, useRelayoutTween } from './useRelayoutTween'

// ---------------------------------------------------------------------------
// Manual animation frames and a controllable reduced-motion media query
// ---------------------------------------------------------------------------

let queued: Map<number, FrameRequestCallback>
let nextId: number

function step(now: number) {
  const callbacks = [...queued.values()]
  queued.clear()
  act(() => callbacks.forEach((cb) => cb(now)))
}

let mediaListeners: Set<() => void>
let reduce: boolean | null // null: matchMedia unsupported

beforeEach(() => {
  queued = new Map()
  nextId = 1
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    queued.set(nextId, cb)
    return nextId++
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id))
  mediaListeners = new Set()
  reduce = null
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    get: () => reduce === null ? undefined : (query: string) => ({
      get matches() { return query === '(prefers-reduced-motion: reduce)' && reduce === true },
      addEventListener: (_: string, fn: () => void) => mediaListeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => mediaListeners.delete(fn),
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window, 'matchMedia')
})

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

const box = (x: number, y: number): NodeBox => ({ x, y, width: 160, height: 52 })

function frame(nodes: Record<string, NodeBox>, view: View = { zoom: 1, x: 0, y: 0 }): CanvasFrame {
  const layout: CanvasLayout = { scenes: new Map(), nodes: new Map(Object.entries(nodes)), width: 500, height: 500 }
  return { layout, links: [], view }
}

function withView(f: CanvasFrame, view: View): CanvasFrame {
  return { ...f, view }
}

const A = frame({ a: box(0, 0) })
const B = frame({ a: box(100, 200), b: box(300, 0) })

function setup(initial: CanvasFrame, resetKey: unknown = 'adv', duration?: number) {
  return renderHook(
    ({ target, key }) => useRelayoutTween(target, key, duration),
    { initialProps: { target: initial, key: resetKey } },
  )
}

// ---------------------------------------------------------------------------
// useRelayoutTween
// ---------------------------------------------------------------------------

describe('useRelayoutTween', () => {
  it('shows the first layout as-is', () => {
    const { result } = setup(A)
    expect(result.current.layout).toBe(A.layout)
    expect(result.current.entering.nodes.size).toBe(0)
    expect(queued.size).toBe(0)
  })

  it('eases from the old layout to the new one over the duration', () => {
    const { result, rerender } = setup(A)
    rerender({ target: B, key: 'adv' })
    expect(result.current.layout.nodes.get('a')).toEqual(box(0, 0))
    expect(result.current.entering.nodes).toEqual(new Set(['b']))
    expect(result.current.enterOpacity).toBe(0)

    step(1000) // first frame fixes the start time
    step(1100) // halfway through 200 ms
    const k = easeOutCubic(0.5)
    expect(result.current.layout.nodes.get('a')).toEqual(box(100 * k, 200 * k))
    expect(result.current.enterOpacity).toBe(k)

    step(1200)
    expect(result.current.layout).toBe(B.layout)
    expect(result.current.entering.nodes.size).toBe(0)
    expect(queued.size).toBe(0)
  })

  it('moves the view in step when it changes with the layout', () => {
    const { result, rerender } = setup(A)
    const moved = withView(B, { zoom: 1, x: -100, y: 0 })
    rerender({ target: moved, key: 'adv' })
    step(0)
    step(100)
    expect(result.current.view.x).toBeCloseTo(-100 * easeOutCubic(0.5))
    step(200)
    expect(result.current.view).toBe(moved.view)
  })

  it('retargets the view when it changes during an animation (anchoring)', () => {
    const { result, rerender } = setup(A)
    rerender({ target: B, key: 'adv' })
    const anchored = withView(B, { zoom: 1, x: 0, y: -200 })
    rerender({ target: anchored, key: 'adv' })
    expect(result.current.view).toEqual({ zoom: 1, x: 0, y: 0 })
    step(0)
    step(100)
    // The anchored card's screen position (view + position) does not move.
    const k = easeOutCubic(0.5)
    expect(result.current.view.y + result.current.layout.nodes.get('a')!.y).toBeCloseTo(0)
    expect(result.current.view.y).toBeCloseTo(-200 * k)
    step(200)
    expect(result.current.view).toBe(anchored.view)
  })

  it('applies a view change on its own (pan, zoom) immediately', () => {
    const { result, rerender } = setup(A)
    const panned = withView(A, { zoom: 2, x: 5, y: 5 })
    rerender({ target: panned, key: 'adv' })
    expect(result.current.view).toBe(panned.view)
    expect(queued.size).toBe(0)
  })

  it('starts a new animation from wherever the running one had reached', () => {
    const { result, rerender } = setup(A)
    rerender({ target: B, key: 'adv' })
    step(0)
    step(100)
    const midway = result.current.layout.nodes.get('a')!
    const C = frame({ a: box(0, 0) })
    rerender({ target: C, key: 'adv' })
    expect(result.current.layout.nodes.get('a')).toEqual(midway)
    expect(queued.size).toBe(1) // the old loop was cancelled, one new frame queued
    step(500)
    step(700)
    expect(result.current.layout).toBe(C.layout)
  })

  it('jumps straight to another adventure', () => {
    const { result, rerender } = setup(A)
    rerender({ target: B, key: 'other' })
    expect(result.current.layout).toBe(B.layout)
    expect(queued.size).toBe(0)
  })

  it('jumps straight to the new layout when the duration is zero', () => {
    const { result, rerender } = setup(A, 'adv', 0)
    rerender({ target: B, key: 'adv' })
    expect(result.current.layout).toBe(B.layout)
  })

  it('does not animate while the user prefers reduced motion', () => {
    reduce = true
    const { result, rerender } = setup(A)
    rerender({ target: B, key: 'adv' })
    expect(result.current.layout).toBe(B.layout)
    expect(queued.size).toBe(0)
  })

  it('stops its frame loop when unmounted', () => {
    const { rerender, unmount } = setup(A)
    rerender({ target: B, key: 'adv' })
    expect(queued.size).toBe(1)
    unmount()
    expect(queued.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// usePrefersReducedMotion
// ---------------------------------------------------------------------------

describe('usePrefersReducedMotion', () => {
  it('is false where matchMedia is unsupported', () => {
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false)
  })

  it('follows the media query as it changes', () => {
    reduce = false
    const { result, unmount } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    reduce = true
    act(() => mediaListeners.forEach((fn) => fn()))
    expect(result.current).toBe(true)
    unmount()
    expect(mediaListeners.size).toBe(0)
  })
})
