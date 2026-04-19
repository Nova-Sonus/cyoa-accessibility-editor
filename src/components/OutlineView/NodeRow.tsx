import { useState, useCallback, useEffect, useRef, useLayoutEffect, useId } from 'react'
import type { AdventureNode, NodeType } from '../../types/adventure'
import { isTerminalNodeType } from '../../types/adventure'
import { useAdventureStore } from '../../store/StoreContext'
import { ChoiceRow } from './ChoiceRow'
import { TypeBadge, ClassifierTag, FieldGroup, ComboField } from '../ui'
import type { ClassifierTagKey } from '../../styles/tokens'
import { NODE_COLOURS } from '../../styles/tokens'
import type { ClassifierTags } from '../../classifier/types'
import styles from './NodeRow.module.css'

/**
 * All eight node_type values from CYOA_Schema.json, in schema-defined order.
 * Exported so tests can assert the full set without duplicating the list.
 */
export const NODE_TYPES: ReadonlyArray<NodeType> = [
  'start',
  'decision',
  'scene_start',
  'end',
  'adventure_success',
  'narrative',
  'combat',
  'puzzle',
]

export interface NodeRowProps {
  node: AdventureNode
  /** Classifier tags for this node, from the store's classifierCache. */
  tags: ClassifierTags
  /** Unique audio filenames across the document, for ComboField suggestions. */
  audioSuggestions: ReadonlyArray<string>
  /** Called after any field is committed to announce the change to screen readers. */
  onAnnounce: (message: string) => void
  /**
   * Called when transitioning a node to a terminal type that had pre-existing
   * choices. The parent renders a corresponding entry in the issues panel.
   */
  onChoicesCleared: (nodeId: string, count: number) => void
  /** Every node id in the document, for populating the nextNode select. */
  allNodeIds: ReadonlyArray<string>
  /**
   * Called when the user creates a stub node via the nextNode combobox.
   * The parent uses this to move focus to the new node's title field.
   */
  onNewNodeCreated: (newNodeId: string) => void
  /**
   * When true, opens the accordion and moves focus to the title input.
   * Used to shift focus to a newly created or activated node.
   */
  focusTitleOnMount?: boolean
  /** Called after focus has been applied so the parent can clear the request. */
  onFocusApplied?: () => void
}

/**
 * A single expandable row in the outline view.
 *
 * Uses a `<button aria-expanded>` disclosure pattern (not `<details>/<summary>`)
 * so the CSS module can control the coloured header background via the
 * `[aria-expanded="true"]` selector. Draft state is held locally and committed
 * to the store on blur (title, narrativeText, audio fields) or on change
 * (node_type, nextNode).
 */
export function NodeRow({
  node,
  tags,
  audioSuggestions,
  onAnnounce,
  onChoicesCleared,
  allNodeIds,
  onNewNodeCreated,
  focusTitleOnMount,
  onFocusApplied,
}: NodeRowProps) {
  const updateNode = useAdventureStore((s) => s.updateNode)
  const deleteNode = useAdventureStore((s) => s.deleteNode)
  const addChoice = useAdventureStore((s) => s.addChoice)

  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  // Tracks a pending focus request across the open-state render boundary.
  const shouldFocusTitleRef = useRef(false)

  const baseId = useId()
  const bodyId = `${baseId}-body`
  const titleId = `${baseId}-title`
  const typeId = `${baseId}-type`
  const narrativeId = `${baseId}-narrative`
  const entryFoleyId = `${baseId}-entry-foley`
  const musicId = `${baseId}-music`
  const soundsId = `${baseId}-sounds`
  const checkpointId = `${baseId}-checkpoint`
  const activitiesGroupId = `${baseId}-activities`
  const noChoicesHintId = `${baseId}-no-choices-hint`

  // ---------------------------------------------------------------------------
  // Local draft state — committed to store on blur / change.
  // ---------------------------------------------------------------------------
  const [titleDraft, setTitleDraft] = useState(node.title)
  const [narrativeDraft, setNarrativeDraft] = useState(node.narrativeText)
  const [entryFoleyDraft, setEntryFoleyDraft] = useState(node.entry_foley ?? '')
  const [musicDraft, setMusicDraft] = useState(node.music ?? '')
  const [soundsDraft, setSoundsDraft] = useState(node.sounds ?? '')

  const [activitiesDraft, setActivitiesDraftState] = useState<string[]>(node.activities ?? [])
  const activitiesDraftRef = useRef<string[]>(activitiesDraft)
  const activityRefs = useRef<Array<HTMLInputElement | null>>([])

  const setActivitiesDraft = useCallback((next: string[]) => {
    activitiesDraftRef.current = next
    setActivitiesDraftState(next)
  }, [])

  // Sync drafts when the node changes from outside (e.g. adventure loaded).
  useEffect(() => { setTitleDraft(node.title) }, [node.title])
  useEffect(() => { setNarrativeDraft(node.narrativeText) }, [node.narrativeText])
  useEffect(() => { setEntryFoleyDraft(node.entry_foley ?? '') }, [node.entry_foley])
  useEffect(() => { setMusicDraft(node.music ?? '') }, [node.music])
  useEffect(() => { setSoundsDraft(node.sounds ?? '') }, [node.sounds])
  useEffect(() => {
    const fromStore = node.activities ?? []
    activitiesDraftRef.current = fromStore
    setActivitiesDraftState(fromStore)
  }, [node.activities])

  // ---------------------------------------------------------------------------
  // Activities handlers
  // ---------------------------------------------------------------------------
  const commitActivities = useCallback(
    (activities: string[]) => {
      const storeValue = node.activities ?? []
      if (JSON.stringify(activities) !== JSON.stringify(storeValue)) {
        updateNode(node.id, { activities: activities.length > 0 ? activities : undefined })
      }
    },
    [node.id, node.activities, updateNode],
  )

  const handleActivityChange = useCallback(
    (index: number, value: string) => {
      const next = activitiesDraftRef.current.map((a, i) => (i === index ? value : a))
      setActivitiesDraft(next)
    },
    [setActivitiesDraft],
  )

  const handleActivityBlur = useCallback(() => {
    commitActivities(activitiesDraftRef.current)
  }, [commitActivities])

  const handleAddActivity = useCallback(() => {
    const next = [...activitiesDraftRef.current, '']
    setActivitiesDraft(next)
    requestAnimationFrame(() => {
      activityRefs.current[next.length - 1]?.focus()
    })
  }, [setActivitiesDraft])

  const handleRemoveActivity = useCallback(
    (index: number) => {
      const next = activitiesDraftRef.current.filter((_, i) => i !== index)
      setActivitiesDraft(next)
      commitActivities(next)
    },
    [setActivitiesDraft, commitActivities],
  )

  const handleActivityKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!e.altKey) return
      const current = activitiesDraftRef.current
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault()
        const next = [...current]
        ;[next[index - 1]!, next[index]!] = [next[index]!, next[index - 1]!]
        setActivitiesDraft(next)
        commitActivities(next)
        activityRefs.current[index - 1]?.focus()
      } else if (e.key === 'ArrowDown' && index < current.length - 1) {
        e.preventDefault()
        const next = [...current]
        ;[next[index + 1]!, next[index]!] = [next[index]!, next[index + 1]!]
        setActivitiesDraft(next)
        commitActivities(next)
        activityRefs.current[index + 1]?.focus()
      }
    },
    [setActivitiesDraft, commitActivities],
  )

  const handleCheckpointChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNode(node.id, { checkpoint: e.target.checked })
      onAnnounce(e.target.checked ? 'Checkpoint enabled.' : 'Checkpoint disabled.')
    },
    [node.id, updateNode, onAnnounce],
  )

  // ---------------------------------------------------------------------------
  // Focus management — open the accordion and focus the title input when requested.
  //
  // Two-effect pattern: the first effect sets `open=true` (requires a re-render
  // to remove the `hidden` attribute from the body div), the layout effect then
  // fires after that render and applies focus once the input is visible.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (focusTitleOnMount) {
      shouldFocusTitleRef.current = true
      setOpen(true)
      onFocusApplied?.()
    }
  }, [focusTitleOnMount, onFocusApplied])

  useLayoutEffect(() => {
    if (shouldFocusTitleRef.current && open) {
      shouldFocusTitleRef.current = false
      titleInputRef.current?.focus()
    }
  }, [open])

  // ---------------------------------------------------------------------------
  // Field commit handlers
  // ---------------------------------------------------------------------------
  const handleTitleBlur = useCallback(() => {
    const trimmed = titleDraft.trim()
    if (trimmed !== node.title) {
      updateNode(node.id, { title: trimmed })
    }
    onAnnounce(`Title updated to "${trimmed}"`)
  }, [titleDraft, node.id, node.title, updateNode, onAnnounce])

  const handleNarrativeBlur = useCallback(() => {
    if (narrativeDraft !== node.narrativeText) {
      updateNode(node.id, { narrativeText: narrativeDraft })
    }
  }, [narrativeDraft, node.id, node.narrativeText, updateNode])

  const handleNodeTypeChange = useCallback(
    (newType: string) => {
      const type = newType as NodeType
      const prevChoicesCount = node.choices.length
      const willBeTerminal = isTerminalNodeType(type)
      if (willBeTerminal && prevChoicesCount > 0) {
        onChoicesCleared(node.id, prevChoicesCount)
      }
      updateNode(node.id, { node_type: type })
      onAnnounce(`Node type changed to ${type}`)
    },
    [node.id, node.choices.length, updateNode, onAnnounce, onChoicesCleared],
  )

  const handleEntryFoleyBlur = useCallback(() => {
    if (entryFoleyDraft !== (node.entry_foley ?? '')) {
      updateNode(node.id, { entry_foley: entryFoleyDraft || undefined })
    }
  }, [entryFoleyDraft, node.id, node.entry_foley, updateNode])

  const handleMusicBlur = useCallback(() => {
    if (musicDraft !== (node.music ?? '')) {
      updateNode(node.id, { music: musicDraft || undefined })
    }
  }, [musicDraft, node.id, node.music, updateNode])

  const handleSoundsBlur = useCallback(() => {
    if (soundsDraft !== (node.sounds ?? '')) {
      updateNode(node.id, { sounds: soundsDraft || undefined })
    }
  }, [soundsDraft, node.id, node.sounds, updateNode])

  const handleAddChoice = useCallback(() => {
    addChoice(node.id, { choiceText: '', choiceResponseConstraint: '', nextNode: '' })
    onAnnounce('Choice added.')
  }, [node.id, addChoice, onAnnounce])

  const handleDeleteConfirm = useCallback(() => {
    deleteNode(node.id)
  }, [node.id, deleteNode])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const isTerminal = isTerminalNodeType(node.node_type)
  const colours = NODE_COLOURS[node.node_type]

  const activeTags: Array<[ClassifierTagKey, boolean]> = [
    ['orphan', tags.isOrphan],
    ['unreachable', tags.unreachable],
    ['junction', tags.isJunction],
    ['branch', tags.isBranch],
    ['linear_link', tags.isLinearLink],
    ['checkpoint', tags.isCheckpoint],
  ]

  const suggestionsList = audioSuggestions as string[]

  return (
    <li
      className={styles.card}
      style={{ '--node-border': colours.border, '--node-bg': colours.bg } as React.CSSProperties}
    >
      {/* Accordion header — button disclosure pattern */}
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((o) => !o)
          setConfirmDelete(false)
        }}
      >
        <span className={styles.title}>{node.title}</span>
        <span className={styles.badges}>
          <TypeBadge type={node.node_type} />
          {activeTags.map(([key, active]) =>
            active ? <ClassifierTag key={key} tag={key} /> : null,
          )}
          {!isTerminal && node.choices.length > 0 && (
            <span className={styles.choiceCount} aria-hidden="true">
              {node.choices.length} {node.choices.length === 1 ? 'choice' : 'choices'}
            </span>
          )}
        </span>
        <span className={styles.chevron} aria-hidden="true">▶</span>
      </button>

      {/* Accordion body — hidden attribute keeps element in DOM for focus management */}
      <div id={bodyId} hidden={!open}>
        <div className={styles.body}>

          {/* ── Narrative ───────────────────────────────────────────────── */}
          <FieldGroup label="Narrative">
            <p className={styles.nodeId}>{node.id}</p>

            <div className={styles.field}>
              <label htmlFor={titleId}>Title</label>
              <input
                ref={titleInputRef}
                id={titleId}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleBlur}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={typeId}>Node type</label>
              <select
                id={typeId}
                value={node.node_type}
                onChange={(e) => handleNodeTypeChange(e.target.value)}
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor={narrativeId}>Narrative text</label>
              <textarea
                id={narrativeId}
                value={narrativeDraft}
                onChange={(e) => setNarrativeDraft(e.target.value)}
                onBlur={handleNarrativeBlur}
              />
            </div>

            <button
              type="button"
              className={styles.ttsButton}
              disabled
              aria-label="Preview narrative text via TTS (not yet available)"
            >
              Preview (TTS)
            </button>
          </FieldGroup>

          {/* ── Audio ───────────────────────────────────────────────────── */}
          <FieldGroup label="Audio" defaultOpen={false}>
            {/* Wrapper divs commit the draft to store when focus leaves the combobox. */}
            <div
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  handleEntryFoleyBlur()
                }
              }}
            >
              <ComboField
                label="Entry foley"
                value={entryFoleyDraft}
                onChange={setEntryFoleyDraft}
                suggestions={suggestionsList}
                id={entryFoleyId}
              />
            </div>

            <div
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  handleMusicBlur()
                }
              }}
            >
              <ComboField
                label="Music"
                value={musicDraft}
                onChange={setMusicDraft}
                suggestions={suggestionsList}
                id={musicId}
              />
            </div>

            <div
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  handleSoundsBlur()
                }
              }}
            >
              <ComboField
                label="Ambient sounds"
                value={soundsDraft}
                onChange={setSoundsDraft}
                suggestions={suggestionsList}
                id={soundsId}
              />
            </div>
          </FieldGroup>

          {/* ── Gameplay ────────────────────────────────────────────────── */}
          <FieldGroup label="Gameplay" defaultOpen={false}>
            <div className={styles.checkboxRow}>
              <input
                id={checkpointId}
                type="checkbox"
                checked={node.checkpoint ?? false}
                onChange={handleCheckpointChange}
              />
              <label htmlFor={checkpointId}>Checkpoint</label>
            </div>

            <fieldset>
              <legend id={activitiesGroupId}>Activities</legend>
              {activitiesDraft.length > 0 && (
                <ul>
                  {activitiesDraft.map((activity, i) => (
                    <li key={i}>
                      <label htmlFor={`${activitiesGroupId}-${i}`}>Activity {i + 1}</label>
                      <input
                        id={`${activitiesGroupId}-${i}`}
                        type="text"
                        value={activity}
                        onChange={(e) => handleActivityChange(i, e.target.value)}
                        onBlur={handleActivityBlur}
                        onKeyDown={(e) => handleActivityKeyDown(i, e)}
                        ref={(el) => {
                          activityRefs.current[i] = el
                        }}
                      />
                      <button type="button" onClick={() => handleRemoveActivity(i)}>
                        Remove activity {i + 1}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={handleAddActivity}>
                Add activity
              </button>
            </fieldset>
          </FieldGroup>

          {/*
           * Terminal nodes (end, adventure_success) cannot have choices.
           * Show an accessible info box rather than silently omitting the section
           * so authors understand why the choices editor is unavailable.
           */}
          {isTerminal ? (
            <p id={noChoicesHintId} className={styles.terminalBox}>
              Terminal node — choices are not permitted on {node.node_type} nodes.
            </p>
          ) : (
            <section aria-label={`Choices for ${node.id}`}>
              {node.choices.length > 0 && (
                <ul>
                  {node.choices.map((c, i) => (
                    <ChoiceRow
                      key={i}
                      nodeId={node.id}
                      choice={c}
                      choiceIndex={i}
                      allNodeIds={allNodeIds}
                      onNewNodeCreated={onNewNodeCreated}
                      onAnnounce={onAnnounce}
                    />
                  ))}
                </ul>
              )}
              <button type="button" onClick={handleAddChoice}>
                Add choice
              </button>
            </section>
          )}
        </div>

        {/* Card footer — delete with inline confirmation */}
        <div className={styles.footer}>
          {confirmDelete ? (
            <>
              <span className={styles.confirmText}>Are you sure?</span>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={handleDeleteConfirm}
              >
                Confirm
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => setConfirmDelete(true)}
            >
              Delete node
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
