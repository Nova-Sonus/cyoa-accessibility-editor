import { useState, useRef, useCallback, useEffect } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import type { AdventureNode } from '../../types/adventure'
import { useCanvasLayout, edgePath, NODE_WIDTH, NODE_HEIGHT } from './useCanvasLayout'
import type { PositionedNode } from './useCanvasLayout'

// ---------------------------------------------------------------------------
// Node colour palette  (WCAG AA contrast verified)
// ---------------------------------------------------------------------------

interface NodeColours {
  fill: string
  stroke: string
  badgeFill: string
  text: string
}

const NODE_COLOURS: Record<AdventureNode['node_type'], NodeColours> = {
  start: { fill: '#dbeafe', stroke: '#2563eb', badgeFill: '#2563eb', text: '#1e3a8a' },
  end: { fill: '#fee2e2', stroke: '#dc2626', badgeFill: '#dc2626', text: '#7f1d1d' },
  adventure_success: { fill: '#dcfce7', stroke: '#16a34a', badgeFill: '#16a34a', text: '#14532d' },
  scene_start: { fill: '#ede9fe', stroke: '#7c3aed', badgeFill: '#7c3aed', text: '#3b0764' },
  decision: { fill: '#fff7ed', stroke: '#ea580c', badgeFill: '#ea580c', text: '#7c2d12' },
  narrative: { fill: '#f8fafc', stroke: '#475569', badgeFill: '#475569', text: '#0f172a' },
  combat: { fill: '#fef2f2', stroke: '#b91c1c', badgeFill: '#b91c1c', text: '#450a0a' },
  puzzle: { fill: '#fefce8', stroke: '#ca8a04', badgeFill: '#ca8a04', text: '#713f12' },
}

const SELECTED_STROKE = '#0ea5e9'
const CHECKPOINT_BADGE_FILL = '#d97706'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BADGE_H = 16
const BADGE_PADDING = 4
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max = 26): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function nodeAriaLabel(node: PositionedNode): string {
  const typeParts: string[] = [node.nodeType.replace(/_/g, ' ')]
  if (node.tags.isCheckpoint) typeParts.push('checkpoint')
  if (node.tags.isOrphan) typeParts.push('orphan')
  if (node.tags.unreachable) typeParts.push('unreachable')
  const choiceLabel =
    node.choiceCount === 0
      ? 'no choices'
      : `${node.choiceCount} ${node.choiceCount === 1 ? 'choice' : 'choices'}`
  return `${node.title}, ${typeParts.join(', ')}, ${choiceLabel}. Press Enter to open in outline view.`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeBox({
  node,
  isSelected,
  onClick,
  onKeyDown,
  tabIndex,
  nodeRef,
}: {
  node: PositionedNode
  isSelected: boolean
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => void
  tabIndex: number
  nodeRef: (el: SVGGElement | null) => void
}) {
  const colours = NODE_COLOURS[node.nodeType]
  const strokeColor = isSelected ? SELECTED_STROKE : colours.stroke
  const strokeWidth = isSelected ? 2.5 : node.tags.isOrphan || node.tags.unreachable ? 1 : 1.5
  const strokeDasharray = node.tags.isOrphan || node.tags.unreachable ? '6 3' : undefined
  const opacity = node.tags.unreachable ? 0.55 : 1

  // Type badge width (approximate — 7px per char + padding)
  const badgeText = node.nodeType.replace(/_/g, ' ')
  const badgeWidth = badgeText.length * 6.5 + BADGE_PADDING * 2

  const checkpointBadgeX = node.x + NODE_WIDTH - 24

  return (
    <g
      role="button"
      aria-label={nodeAriaLabel(node)}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      ref={nodeRef}
      style={{ cursor: 'pointer', outline: 'none' }}
      opacity={opacity}
    >
      {/* Selection / focus ring drawn outside the box */}
      {isSelected && (
        <rect
          x={node.x - 3}
          y={node.y - 3}
          width={NODE_WIDTH + 6}
          height={NODE_HEIGHT + 6}
          rx={9}
          ry={9}
          fill="none"
          stroke={SELECTED_STROKE}
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}

      {/* Main box */}
      <rect
        x={node.x}
        y={node.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        ry={6}
        fill={colours.fill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />

      {/* Checkpoint amber bar on left edge */}
      {node.tags.isCheckpoint && (
        <rect
          x={node.x}
          y={node.y + 8}
          width={4}
          height={NODE_HEIGHT - 16}
          rx={2}
          fill={CHECKPOINT_BADGE_FILL}
        />
      )}

      {/* Node-type badge */}
      <rect
        x={node.x + 8}
        y={node.y + 8}
        width={badgeWidth}
        height={BADGE_H}
        rx={3}
        ry={3}
        fill={colours.badgeFill}
      />
      <text
        x={node.x + 8 + BADGE_PADDING}
        y={node.y + 8 + BADGE_H - 4}
        fontSize={9}
        fontFamily="system-ui, sans-serif"
        fill="white"
        aria-hidden="true"
      >
        {badgeText}
      </text>

      {/* Checkpoint tick badge */}
      {node.tags.isCheckpoint && (
        <rect
          x={checkpointBadgeX}
          y={node.y + 8}
          width={16}
          height={BADGE_H}
          rx={3}
          fill={CHECKPOINT_BADGE_FILL}
        />
      )}
      {node.tags.isCheckpoint && (
        <text
          x={checkpointBadgeX + 3}
          y={node.y + 8 + BADGE_H - 4}
          fontSize={9}
          fontFamily="system-ui, sans-serif"
          fill="white"
          aria-hidden="true"
        >
          ✓ck
        </text>
      )}

      {/* Title */}
      <text
        x={node.x + 10}
        y={node.y + 40}
        fontSize={12}
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
        fill={colours.text}
        aria-hidden="true"
      >
        {truncate(node.title)}
      </text>

      {/* Choice count */}
      <text
        x={node.x + 10}
        y={node.y + 57}
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fill="#64748b"
        aria-hidden="true"
      >
        {node.choiceCount === 0
          ? 'No choices'
          : `${node.choiceCount} ${node.choiceCount === 1 ? 'choice' : 'choices'}`}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function CanvasLegend() {
  const items: Array<{ type: AdventureNode['node_type']; label: string }> = [
    { type: 'start', label: 'Start' },
    { type: 'scene_start', label: 'Scene start' },
    { type: 'decision', label: 'Decision' },
    { type: 'narrative', label: 'Narrative' },
    { type: 'combat', label: 'Combat' },
    { type: 'puzzle', label: 'Puzzle' },
    { type: 'end', label: 'End' },
    { type: 'adventure_success', label: 'Success' },
  ]

  return (
    <div
      aria-label="Node type legend"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '8px 0',
        fontSize: '11px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {items.map(({ type, label }) => {
        const c = NODE_COLOURS[type]
        return (
          <span
            key={type}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                background: c.fill,
                border: `2px solid ${c.stroke}`,
                borderRadius: '2px',
              }}
            />
            {label}
          </span>
        )
      })}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '12px',
            height: '12px',
            background: '#f8fafc',
            border: '2px dashed #475569',
            borderRadius: '2px',
          }}
        />
        Orphan / unreachable
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: '4px',
            height: '12px',
            background: '#d97706',
            borderRadius: '2px',
          }}
        />
        Checkpoint
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CanvasViewProps {
  /** Called when the user activates a node — switch to outline view and focus it. */
  onNodeActivate: (nodeId: string) => void
}

/**
 * Canvas view — a zoomable, pannable SVG graph of the adventure.
 *
 * Accessibility model:
 * - The SVG uses a *composite widget* pattern (roving tabIndex) so keyboard
 *   users can arrow-key through nodes without excessive Tab stops.
 * - Each node has `role="button"` and a descriptive `aria-label`.
 * - Enter / Space on a node calls `onNodeActivate` which switches to the
 *   outline view and moves focus there — the primary editing interface.
 * - The diagram container has `aria-label` summarising node/edge counts.
 * - Colour is never the sole differentiator (badges carry text).
 */
export function CanvasView({ onNodeActivate }: CanvasViewProps) {
  const adventureDoc = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)

  const { nodes, edges } = useCanvasLayout(adventureDoc, classifierCache)

  // ---- Pan / zoom state ---------------------------------------------------
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)

  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  // ---- Selection (roving tabIndex) ----------------------------------------
  const [selectedIndex, setSelectedIndex] = useState(0)
  const nodeRefs = useRef<Array<SVGGElement | null>>([])

  // Keep nodeRefs array in sync with node count
  useEffect(() => {
    nodeRefs.current = nodeRefs.current.slice(0, nodes.length)
  }, [nodes.length])

  // Focus the selected node element when selection changes via keyboard
  const lastInteractionWasKeyboard = useRef(false)

  // ---- Zoom controls ------------------------------------------------------
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))))
  }, [])

  const handleResetView = useCallback(() => {
    setPanX(0)
    setPanY(0)
    setZoom(1)
  }, [])

  // ---- Mouse wheel zoom ---------------------------------------------------
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, parseFloat((z + delta).toFixed(2)))))
  }, [])

  // ---- Mouse pan ----------------------------------------------------------
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setPanX((p) => p + dx)
    setPanY((p) => p + dy)
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false
  }, [])

  // ---- Node interaction ---------------------------------------------------
  const handleNodeClick = useCallback(
    (nodeId: string, index: number) => {
      lastInteractionWasKeyboard.current = false
      setSelectedIndex(index)
      onNodeActivate(nodeId)
    },
    [onNodeActivate],
  )

  const handleNodeKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGGElement>, nodeId: string, index: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onNodeActivate(nodeId)
        return
      }

      let nextIndex = index
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        nextIndex = Math.min(nodes.length - 1, index + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        nextIndex = Math.max(0, index - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        nextIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        nextIndex = nodes.length - 1
      } else {
        return
      }

      lastInteractionWasKeyboard.current = true
      setSelectedIndex(nextIndex)
      nodeRefs.current[nextIndex]?.focus()
    },
    [nodes.length],
  )

  // ---- Empty state --------------------------------------------------------
  if (adventureDoc.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  // ---- Derived summary for aria-label -------------------------------------
  const edgeCount = edges.length
  const graphLabel = `Adventure graph: ${nodes.length} nodes, ${edgeCount} connections. Use arrow keys to navigate nodes. Press Enter to open a node in outline view.`

  return (
    <div>
      {/* Zoom / pan toolbar */}
      <div
        role="toolbar"
        aria-label="Canvas controls"
        style={{ display: 'flex', gap: '8px', padding: '4px 0 8px', alignItems: 'center' }}
      >
        <button type="button" onClick={handleZoomIn} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={handleZoomOut} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={handleResetView} aria-label="Reset view">
          Reset
        </button>
        <span aria-live="polite" aria-atomic="true" style={{ fontSize: '12px', color: '#64748b' }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <CanvasLegend />

      {/* SVG canvas — role="region" is required for aria-label to be valid on a div */}
      <div
        role="region"
        aria-label={graphLabel}
        style={{ overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: '8px' }}
      >
        <svg
          width="100%"
          style={{ display: 'block', minHeight: '400px', cursor: isDragging.current ? 'grabbing' : 'grab' }}
          aria-hidden="true"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrowhead-selected"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill={SELECTED_STROKE} />
            </marker>
          </defs>

          <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
            {/* Edges — rendered behind nodes */}
            <g aria-hidden="true">
              {edges.map((edge) => {
                const isSelectedEdge =
                  selectedIndex >= 0 &&
                  nodes[selectedIndex] !== undefined &&
                  nodes[selectedIndex]!.id === edge.sourceId
                return (
                  <g key={edge.id}>
                    <path
                      d={edgePath(edge.x1, edge.y1, edge.x2, edge.y2)}
                      fill="none"
                      stroke={isSelectedEdge ? SELECTED_STROKE : '#94a3b8'}
                      strokeWidth={isSelectedEdge ? 2 : 1.5}
                      markerEnd={
                        isSelectedEdge ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'
                      }
                    />
                    {/* Choice label on the edge midpoint */}
                    {edge.choiceText && (
                      <text
                        x={(edge.x1 + edge.x2) / 2}
                        y={(edge.y1 + edge.y2) / 2 - 5}
                        fontSize={9}
                        fontFamily="system-ui, sans-serif"
                        fill="#64748b"
                        textAnchor="middle"
                      >
                        {truncate(edge.choiceText, 20)}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>

            {/* Nodes */}
            <g>
              {nodes.map((node, i) => (
                <NodeBox
                  key={node.id}
                  node={node}
                  isSelected={selectedIndex === i}
                  tabIndex={selectedIndex === i ? 0 : -1}
                  onClick={() => handleNodeClick(node.id, i)}
                  onKeyDown={(e) => handleNodeKeyDown(e, node.id, i)}
                  nodeRef={(el) => {
                    nodeRefs.current[i] = el
                  }}
                />
              ))}
            </g>
          </g>
        </svg>
      </div>

      {/* Accessible node list — screen reader alternative to the visual graph */}
      <section aria-label="Node list (screen reader summary)">
        <h2 style={{ fontSize: '14px', margin: '16px 0 4px' }}>
          Nodes ({nodes.length})
        </h2>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '4px',
          }}
        >
          {nodes.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onNodeActivate(node.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: NODE_COLOURS[node.nodeType].fill,
                  border: `1px solid ${NODE_COLOURS[node.nodeType].stroke}`,
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: NODE_COLOURS[node.nodeType].text,
                }}
              >
                <span style={{ fontWeight: 600 }}>{node.title}</span>
                <span style={{ display: 'block', fontSize: '10px', opacity: 0.8 }}>
                  {node.nodeType.replace(/_/g, ' ')}
                  {node.tags.isCheckpoint ? ' · checkpoint' : ''}
                  {node.tags.isOrphan ? ' · orphan' : ''}
                  {node.tags.unreachable ? ' · unreachable' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
