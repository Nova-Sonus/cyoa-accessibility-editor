import { describe, it, expect } from 'vitest'
import type { CanvasLayout, SceneBox } from './sceneLayout'
import type { NodeBox } from './treeLayout'
import type { RoutedLink } from './linkRouting'
import type { View } from './usePanZoom'
import {
  anchorView,
  easeOutCubic,
  interpolateFrame,
  KEEP_VISIBLE_MARGIN,
  linkKey,
  mixBox,
  mixPoints,
  mixView,
  RELAYOUT_MS,
} from './relayout'
import type { CanvasFrame } from './relayout'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const box = (x: number, y: number, width = 160, height = 52): NodeBox => ({ x, y, width, height })

const scene = (key: string, x: number, y: number, width = 180, height = 64, expanded = true): SceneBox =>
  ({ key, x, y, width, height, expanded })

function layout(
  scenes: Record<string, SceneBox>,
  nodes: Record<string, NodeBox>,
  width = 1000,
  height = 500,
): CanvasLayout {
  return { scenes: new Map(Object.entries(scenes)), nodes: new Map(Object.entries(nodes)), width, height }
}

function link(from: string, to: string, points: [number, number][], choiceIndex = 0): RoutedLink {
  return {
    from,
    to,
    choiceIndex,
    kind: 'tree',
    fromAnchor: { type: 'node', id: from },
    toAnchor: { type: 'node', id: to },
    points: points.map(([x, y]) => ({ x, y })),
    isBack: false,
    count: 1,
  }
}

const VIEW: View = { zoom: 1, x: 0, y: 0 }

// ---------------------------------------------------------------------------
// Easing and mixing
// ---------------------------------------------------------------------------

describe('RELAYOUT_MS', () => {
  it('stays within the 250 ms the ticket allows', () => {
    expect(RELAYOUT_MS).toBeGreaterThan(0)
    expect(RELAYOUT_MS).toBeLessThanOrEqual(250)
  })
})

describe('easeOutCubic', () => {
  it('runs from 0 to 1, decelerating', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })

  it('clamps progress outside 0–1', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })
})

describe('mixBox / mixPoints / mixView', () => {
  it('moves position and size, keeping the target’s other fields', () => {
    const to = scene('k', 100, 200, 300, 400, false)
    expect(mixBox(box(0, 0, 100, 100), to, 0.5)).toEqual(scene('k', 50, 100, 200, 250, false))
  })

  it('mixes matching points', () => {
    expect(mixPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 10 }, { x: 30, y: 10 }], 0.5))
      .toEqual([{ x: 5, y: 5 }, { x: 20, y: 5 }])
  })

  it('mixes the view', () => {
    expect(mixView({ zoom: 1, x: 0, y: 0 }, { zoom: 2, x: 10, y: -10 }, 0.25))
      .toEqual({ zoom: 1.25, x: 2.5, y: -2.5 })
  })
})

describe('linkKey', () => {
  it('identifies a link by its source and choice', () => {
    expect(linkKey({ from: 'a', choiceIndex: 2 })).toBe('a#2')
  })
})

// ---------------------------------------------------------------------------
// interpolateFrame
// ---------------------------------------------------------------------------

describe('interpolateFrame', () => {
  const from: CanvasFrame = {
    layout: layout({ s: scene('s', 0, 0, 200, 100) }, { a: box(0, 0), gone: box(0, 100) }, 400, 200),
    links: [
      link('a', 'b', [[0, 0], [10, 0]]),
      link('a', 'c', [[0, 0], [10, 0]], 1),
    ],
    view: { zoom: 1, x: 0, y: 0 },
  }
  const to: CanvasFrame = {
    layout: layout(
      { s: scene('s', 100, 0, 400, 100), t: scene('t', 600, 0) },
      { a: box(100, 50), b: box(300, 50) },
      800,
      400,
    ),
    links: [
      link('a', 'b', [[100, 50], [110, 50]]),
      link('a', 'c', [[100, 50], [105, 50], [110, 60]], 1),
      link('b', 'a', [[300, 50], [100, 50]]),
    ],
    view: { zoom: 1, x: -40, y: 20 },
  }

  it('moves scenes, cards, matching links and the view part of the way', () => {
    const f = interpolateFrame(from, to, 0.5)
    expect(f.layout.scenes.get('s')).toEqual(scene('s', 50, 0, 300, 100))
    expect(f.layout.nodes.get('a')).toEqual(box(50, 25))
    expect(f.links[0]!.points).toEqual([{ x: 50, y: 25 }, { x: 60, y: 25 }])
    expect(f.view).toEqual({ zoom: 1, x: -20, y: 10 })
    expect(f.layout.width).toBe(600)
    expect(f.layout.height).toBe(300)
    expect(f.enterOpacity).toBe(0.5)
  })

  it('draws new items at their final place and lists them as entering', () => {
    const f = interpolateFrame(from, to, 0.5)
    expect(f.layout.scenes.get('t')).toEqual(scene('t', 600, 0))
    expect(f.layout.nodes.get('b')).toEqual(box(300, 50))
    expect(f.entering.scenes).toEqual(new Set(['t']))
    expect(f.entering.nodes).toEqual(new Set(['b']))
  })

  it('fades in a link whose route changed shape instead of morphing it', () => {
    const f = interpolateFrame(from, to, 0.5)
    expect(f.entering.links).toEqual(new Set(['a#1', 'b#0']))
    expect(f.links[1]!.points).toEqual(to.links[1]!.points)
  })

  it('drops items that are no longer laid out', () => {
    expect(interpolateFrame(from, to, 0.5).layout.nodes.has('gone')).toBe(false)
  })

  it('is exactly the target, with nothing entering, once complete', () => {
    const f = interpolateFrame(from, to, 1)
    expect(f.layout).toBe(to.layout)
    expect(f.links).toBe(to.links)
    expect(f.view).toBe(to.view)
    expect(f.entering.nodes.size).toBe(0)
    expect(f.enterOpacity).toBe(1)
  })

  it('starts exactly where the previous frame was', () => {
    const f = interpolateFrame(from, to, 0)
    expect(f.layout.nodes.get('a')).toEqual(box(0, 0))
    expect(f.view).toEqual(from.view)
  })
})

// ---------------------------------------------------------------------------
// anchorView
// ---------------------------------------------------------------------------

describe('anchorView', () => {
  const before = layout({ s: scene('s', 0, 0, 400, 300) }, { a: box(100, 100), b: box(100, 200) })
  const after = layout({ s: scene('s', 0, 50, 400, 400) }, { a: box(100, 180), b: box(340, 260), n: box(340, 20) })

  it('pans by the anchor node’s movement (scaled by zoom) so it stays put on screen', () => {
    const view = { zoom: 2, x: 10, y: 10 }
    expect(anchorView(view, before, after, { node: 'a' }, [], 0, 0)).toEqual({ zoom: 2, x: 10, y: 10 - 160 })
  })

  it('can anchor a scene box', () => {
    expect(anchorView(VIEW, before, after, { scene: 's' }, [], 0, 0)).toEqual({ zoom: 1, x: 0, y: -50 })
  })

  it('ignores an anchor missing from either layout', () => {
    expect(anchorView(VIEW, before, after, { node: 'n' }, [], 0, 0)).toBe(VIEW)
    expect(anchorView(VIEW, before, after, { scene: 'ghost' }, [], 0, 0)).toBe(VIEW)
    expect(anchorView(VIEW, before, after, null, [], 0, 0)).toBe(VIEW)
  })

  it('returns the same view object when nothing needs to move', () => {
    expect(anchorView(VIEW, before, after, null, ['a'], 1000, 1000)).toBe(VIEW)
  })

  it('pans as little as possible to bring a node into view, with the margin', () => {
    // n's right edge is at 500; the viewport is 400 wide.
    const v = anchorView(VIEW, before, after, null, ['n'], 400, 400)
    expect(v).toEqual({ zoom: 1, x: 400 - KEEP_VISIBLE_MARGIN - 500, y: KEEP_VISIBLE_MARGIN - 20 })
  })

  it('pans right and down when the node is off the top-left', () => {
    const v = anchorView({ zoom: 1, x: -200, y: -300 }, before, after, null, ['a'], 600, 600)
    expect(v).toEqual({ zoom: 1, x: KEEP_VISIBLE_MARGIN - 100, y: KEEP_VISIBLE_MARGIN - 180 })
  })

  it('keeps later nodes in view only where that keeps the earlier ones too', () => {
    // a (x 100–260) and n (x 340–500) cannot both fit 300 px wide.
    // n sits off the left, so the smallest pan puts its left edge at the margin.
    const v = anchorView({ zoom: 1, x: -400, y: 0 }, before, after, null, ['n', 'a'], 300, 600)
    expect(v.x).toBe(KEEP_VISIBLE_MARGIN - 340)
  })

  it('applies the anchor before keeping nodes in view', () => {
    const v = anchorView(VIEW, before, after, { node: 'a' }, ['a'], 1000, 1000)
    expect(v).toEqual({ zoom: 1, x: 0, y: -80 })
  })

  it('aligns a node larger than the viewport to the top-left margin', () => {
    const big = layout({}, { big: box(500, 500, 1000, 1000) })
    expect(anchorView(VIEW, big, big, null, ['big'], 400, 400))
      .toEqual({ zoom: 1, x: KEEP_VISIBLE_MARGIN - 500, y: KEEP_VISIBLE_MARGIN - 500 })
  })

  it('skips keeping nodes in view while the viewport is unmeasured, and ignores unknown ids', () => {
    expect(anchorView(VIEW, before, after, null, ['n'], 0, 0)).toBe(VIEW)
    expect(anchorView(VIEW, before, after, null, ['ghost'], 400, 400)).toBe(VIEW)
  })
})
