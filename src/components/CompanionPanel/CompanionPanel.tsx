import { useState, useCallback, useRef, useEffect, useMemo, useId } from 'react'
import type { KeyboardEvent } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { deriveAssetManifest } from '../AssetManifest'
import { FieldGroup, Field, SelectField } from '../ui'
import type { NodeType, Choice } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier/types'
import type { ClassifierTagKey } from '../../styles/tokens'
import { NODE_COLOURS } from '../../styles/tokens'
import { TypeBadge, ClassifierTag } from '../ui'
import { isTerminalNodeType } from '../../types/adventure'
import styles from './CompanionPanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TYPES: ReadonlyArray<NodeType> = [
  'start',
  'decision',
  'scene_start',
  'end',
  'adventure_success',
  'narrative',
  'combat',
  'puzzle',
]

interface BoolTagEntry {
  field: keyof Pick<ClassifierTags, 'isOrphan' | 'unreachable' | 'isJunction' | 'isBranch' | 'isLinearLink' | 'isCheckpoint'>
  key: ClassifierTagKey
}

const BOOL_TAG_MAP: ReadonlyArray<BoolTagEntry> = [
  { field: 'isOrphan',      key: 'orphan' },
  { field: 'unreachable',   key: 'unreachable' },
  { field: 'isJunction',    key: 'junction' },
  { field: 'isBranch',      key: 'branch' },
  { field: 'isLinearLink',  key: 'linear_link' },
  { field: 'isCheckpoint',  key: 'checkpoint' },
]

// ---------------------------------------------------------------------------
// NodeComboField — WAI-ARIA combobox for nextNode selection
// ---------------------------------------------------------------------------

interface NodeOption {
  id: string
  title: string
  node_type: NodeType
}

const CREATE_SENTINEL = '__create_new__'

interface NodeComboFieldProps {
  label: string
  value: string
  onChange: (nodeId: string) => void
  onCreateNew: () => void
  allNodes: NodeOption[]
}

function NodeComboField({ label, value, onChange, onCreateNew, allNodes }: NodeComboFieldProps) {
  const uid = useId()
  const inputId = `${uid}-input`
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-option-${i}`
  const containerRef = useRef<HTMLDivElement>(null)

  const currentTitle = allNodes.find((n) => n.id === value)?.title ?? ''
  const [inputValue, setInputValue] = useState(currentTitle)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  // Sync display value when selected nodeId changes externally
  useEffect(() => {
    setInputValue(allNodes.find((n) => n.id === value)?.title ?? '')
  }, [value, allNodes])

  const filtered = useMemo(() => {
    const q = inputValue.toLowerCase()
    return allNodes.filter((n) => n.title.toLowerCase().includes(q))
  }, [inputValue, allNodes])

  // Options: filtered nodes + "Create new node…" sentinel
  const totalOptions = filtered.length + 1
  const isOpen = open && totalOptions > 0

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setInputValue(allNodes.find((n) => n.id === value)?.title ?? '')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [value, allNodes])

  function commit(index: number) {
    if (index < filtered.length) {
      const node = filtered[index]!
      onChange(node.id)
      setInputValue(node.title)
    } else {
      onCreateNew()
    }
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setOpen(true)
        setActiveIndex(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((i) => Math.min(i + 1, totalOptions - 1))
        e.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex((i) => Math.max(i - 1, 0))
        e.preventDefault()
        break
      case 'Enter':
        if (activeIndex >= 0) {
          commit(activeIndex)
          e.preventDefault()
        }
        break
      case 'Escape':
        setOpen(false)
        setInputValue(allNodes.find((n) => n.id === value)?.title ?? '')
        setActiveIndex(-1)
        e.preventDefault()
        break
    }
  }

  const activeDescendant = activeIndex >= 0 ? optionId(activeIndex) : undefined

  return (
    <div className={styles.comboField} ref={containerRef}>
      <label className={styles.comboLabel} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.comboInputWrapper}>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          className={styles.comboInput}
          value={inputValue}
          placeholder="None"
          onChange={(e) => {
            setInputValue(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.comboChevron}
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen((o) => !o)}
        >
          ▼
        </button>
      </div>
      <ul id={listboxId} role="listbox" className={styles.comboListbox} hidden={!isOpen}>
        {filtered.map((node, i) => {
          const colours = NODE_COLOURS[node.node_type]
          return (
            <li
              key={node.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.comboOption} ${i === activeIndex ? styles.comboOptionActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); commit(i) }}
            >
              <span
                className={styles.comboDot}
                aria-hidden="true"
                style={{ '--dot-color': colours.badge } as React.CSSProperties}
              />
              {node.title}
            </li>
          )
        })}
        <li
          id={optionId(filtered.length)}
          role="option"
          aria-selected={filtered.length === activeIndex}
          className={`${styles.comboOption} ${styles.comboOptionCreate} ${filtered.length === activeIndex ? styles.comboOptionActive : ''}`}
          onMouseDown={(e) => { e.preventDefault(); commit(filtered.length) }}
          data-value={CREATE_SENTINEL}
        >
          + Create new node…
        </li>
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CompanionChoiceRow — single choice editor
// ---------------------------------------------------------------------------

interface CompanionChoiceRowProps {
  choice: Choice
  choiceIndex: number
  nodeId: string
  allNodes: NodeOption[]
  onUpdate: (patch: Partial<Choice>) => void
  onDelete: () => void
  onCreateAndLink: () => void
}

function CompanionChoiceRow({
  choice,
  choiceIndex,
  allNodes,
  onUpdate,
  onDelete,
  onCreateAndLink,
}: CompanionChoiceRowProps) {
  const choiceNum = choiceIndex + 1

  return (
    <div className={styles.choiceRow}>
      <div className={styles.choiceRowHeader}>
        <span className={styles.choiceRowLabel}>Choice {choiceNum}</span>
        <button
          type="button"
          className={styles.choiceDeleteBtn}
          onClick={onDelete}
          aria-label={`Delete choice ${choiceNum}`}
        >
          ✕
        </button>
      </div>
      <Field
        label="Choice text"
        value={choice.choiceText}
        onChange={(v) => onUpdate({ choiceText: v })}
      />
      <Field
        label="Constraint"
        value={choice.choiceResponseConstraint}
        onChange={(v) => onUpdate({ choiceResponseConstraint: v })}
      />
      <NodeComboField
        label="Next node"
        value={choice.nextNode}
        onChange={(nodeId) => onUpdate({ nextNode: nodeId })}
        onCreateNew={onCreateAndLink}
        allNodes={allNodes}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CompanionPanel
// ---------------------------------------------------------------------------

export function CompanionPanel() {
  // --- Store selectors (all hooks BEFORE early return) ---
  const selectedNodeId = useAdventureStore((s) => s.selectedNodeId)
  const document = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const updateNode = useAdventureStore((s) => s.updateNode)
  const addNode = useAdventureStore((s) => s.addNode)
  const addChoice = useAdventureStore((s) => s.addChoice)
  const updateChoice = useAdventureStore((s) => s.updateChoice)
  const deleteChoice = useAdventureStore((s) => s.deleteChoice)
  const deleteNode = useAdventureStore((s) => s.deleteNode)

  // --- Derived ---
  const node = useMemo(
    () => (selectedNodeId != null ? (document.find((n) => n.id === selectedNodeId) ?? null) : null),
    [selectedNodeId, document],
  )
  const tags = useMemo(
    () => (selectedNodeId != null ? (classifierCache.get(selectedNodeId) ?? null) : null),
    [selectedNodeId, classifierCache],
  )
  const allNodes = useMemo(
    () => document.map((n) => ({ id: n.id, title: n.title, node_type: n.node_type })),
    [document],
  )
  const audioSuggestions = useMemo(
    () => deriveAssetManifest(document).map((e) => e.filename),
    [document],
  )

  // --- Local state ---
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Reset delete confirmation when selection changes
  useEffect(() => {
    setDeleteConfirm(false)
  }, [selectedNodeId])

  // --- Handlers ---
  const handleAddChoice = useCallback(() => {
    if (node == null) return
    addChoice(node.id, { choiceText: '', choiceResponseConstraint: '', nextNode: '' })
  }, [node, addChoice])

  const handleCreateAndLink = useCallback((choiceIndex: number) => {
    if (node == null) return
    const newId = crypto.randomUUID()
    addNode({
      id: newId,
      title: 'New node',
      node_type: 'decision',
      narrativeText: '',
      choices: [],
    })
    updateChoice(node.id, choiceIndex, { nextNode: newId })
  }, [node, addNode, updateChoice])

  const handleDeleteNode = useCallback(() => {
    if (node == null) return
    deleteNode(node.id)
  }, [node, deleteNode])

  // --- Early return ---
  if (node == null) {
    return (
      <aside className={styles.panel} aria-label="Node editor">
        <p className={styles.placeholder}>Select a node to edit</p>
      </aside>
    )
  }

  const colours = NODE_COLOURS[node.node_type]
  const isTerminal = isTerminalNodeType(node.node_type)
  const isStart = node.node_type === 'start'

  return (
    <aside
      className={styles.panel}
      aria-label="Node editor"
      style={{ '--node-border': colours.border, '--node-bg': colours.bg } as React.CSSProperties}
    >
      {/* Panel header */}
      <header className={styles.header}>
        <h2 className={styles.nodeTitle}>{node.title}</h2>
        <div className={styles.typeRow}>
          <TypeBadge type={node.node_type} />
        </div>
        {tags != null && (
          <div className={styles.tagList}>
            {BOOL_TAG_MAP.map(({ field, key }) =>
              tags[field] ? <ClassifierTag key={key} tag={key} /> : null,
            )}
            {tags.isTerminal && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f1f5f9', '--meta-fg': '#475569', '--meta-border': '#cbd5e1' } as React.CSSProperties}
              >
                Terminal
              </span>
            )}
            {tags.sceneId != null && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f0fdfa', '--meta-fg': '#0f766e', '--meta-border': '#99f6e4' } as React.CSSProperties}
              >
                Scene: {tags.sceneId.slice(0, 8)}
              </span>
            )}
            {isFinite(tags.depth) && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f8fafc', '--meta-fg': '#334155', '--meta-border': '#e2e8f0' } as React.CSSProperties}
              >
                Depth: {tags.depth}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* NARRATIVE section */}
        <FieldGroup label="Narrative" icon="📖" defaultOpen>
          <div className={styles.sectionFields}>
            <Field
              label="Node ID"
              value={node.id}
              onChange={() => {}}
              disabled
            />
            <Field
              label="Title"
              value={node.title}
              onChange={(v) => updateNode(node.id, { title: v })}
            />
            <SelectField
              label="Node type"
              value={node.node_type}
              options={NODE_TYPES as string[]}
              onChange={(v) => updateNode(node.id, { node_type: v as NodeType })}
            />
            <div className={styles.narrativeField}>
              <div className={styles.narrativeHeader}>
                <label className={styles.narrativeLabel} htmlFor={`${node.id}-narrative`}>
                  Narrative text
                </label>
                <button
                  type="button"
                  className={styles.ttsButton}
                  disabled
                  title="Coming soon"
                  aria-label="TTS preview (coming soon)"
                >
                  📢 TTS
                </button>
              </div>
              <textarea
                id={`${node.id}-narrative`}
                className={styles.narrativeTextarea}
                value={node.narrativeText}
                onChange={(e) => updateNode(node.id, { narrativeText: e.target.value })}
                rows={6}
              />
            </div>
          </div>
        </FieldGroup>

        {/* AUDIO section */}
        <FieldGroup label="Audio" icon="🔊" defaultOpen={false}>
          <div className={styles.sectionFields}>
            <AudioComboField
              label="Entry foley"
              value={node.entry_foley ?? ''}
              onChange={(v) => updateNode(node.id, { entry_foley: v || undefined })}
              suggestions={audioSuggestions}
            />
            <AudioComboField
              label="Music"
              value={node.music ?? ''}
              onChange={(v) => updateNode(node.id, { music: v || undefined })}
              suggestions={audioSuggestions}
            />
            <AudioComboField
              label="Sounds"
              value={node.sounds ?? ''}
              onChange={(v) => updateNode(node.id, { sounds: v || undefined })}
              suggestions={audioSuggestions}
            />
          </div>
        </FieldGroup>

        {/* GAMEPLAY section */}
        <FieldGroup label="Gameplay" icon="🎮" defaultOpen={false}>
          <div className={styles.sectionFields}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={node.checkpoint ?? false}
                onChange={(e) => updateNode(node.id, { checkpoint: e.target.checked || undefined })}
              />
              <span>Checkpoint</span>
            </label>
            <ActivitiesList
              activities={node.activities ?? []}
              onChange={(activities) => updateNode(node.id, { activities: activities.length > 0 ? activities : undefined })}
            />
          </div>
        </FieldGroup>

        {/* CHOICES section */}
        <FieldGroup label={`Choices (${node.choices.length})`} defaultOpen>
          <div className={styles.sectionFields}>
            {isTerminal ? (
              <p className={styles.terminalMessage}>Terminal nodes cannot have choices.</p>
            ) : (
              <>
                {node.choices.length === 0 ? (
                  <p className={styles.emptyChoices}>No choices yet.</p>
                ) : (
                  node.choices.map((choice, i) => (
                    <CompanionChoiceRow
                      key={i}
                      choice={choice}
                      choiceIndex={i}
                      nodeId={node.id}
                      allNodes={allNodes}
                      onUpdate={(patch) => updateChoice(node.id, i, patch)}
                      onDelete={() => deleteChoice(node.id, i)}
                      onCreateAndLink={() => handleCreateAndLink(i)}
                    />
                  ))
                )}
                <button
                  type="button"
                  className={styles.addChoiceButton}
                  onClick={handleAddChoice}
                >
                  + Add choice
                </button>
              </>
            )}
          </div>
        </FieldGroup>
      </div>

      {/* Panel footer */}
      <footer className={styles.footer}>
        {!isStart && (
          deleteConfirm ? (
            <div className={styles.deleteConfirm}>
              <span className={styles.deleteConfirmText}>Delete this node?</span>
              <button
                type="button"
                className={`${styles.footerButton} ${styles.footerButtonDanger}`}
                onClick={handleDeleteNode}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className={styles.footerButton}
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.footerButton} ${styles.footerButtonDanger}`}
              onClick={() => setDeleteConfirm(true)}
            >
              Delete node
            </button>
          )
        )}
        <span className={styles.footerNodeId}>{node.id}</span>
      </footer>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// AudioComboField — simple text + suggestions combobox for audio fields
// ---------------------------------------------------------------------------

interface AudioComboFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
}

function AudioComboField({ label, value, onChange, suggestions }: AudioComboFieldProps) {
  const uid = useId()
  const inputId = `${uid}-input`
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-option-${i}`
  const containerRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const filtered = useMemo(
    () => suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value),
    [suggestions, value],
  )

  const isOpen = open && filtered.length > 0

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function commit(s: string) {
    onChange(s)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        setOpen(true)
        setActiveIndex(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
        e.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex((i) => Math.max(i - 1, 0))
        e.preventDefault()
        break
      case 'Enter':
        if (activeIndex >= 0) { commit(filtered[activeIndex]!); e.preventDefault() }
        break
      case 'Escape':
        setOpen(false); setActiveIndex(-1); e.preventDefault()
        break
    }
  }

  return (
    <div className={styles.comboField} ref={containerRef}>
      <label className={styles.comboLabel} htmlFor={inputId}>{label}</label>
      <div className={styles.comboInputWrapper}>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={styles.comboInput}
          value={value}
          placeholder="none"
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <ul id={listboxId} role="listbox" className={styles.comboListbox} hidden={!isOpen}>
        {filtered.map((s, i) => (
          <li
            key={s}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            className={`${styles.comboOption} ${i === activeIndex ? styles.comboOptionActive : ''}`}
            onMouseDown={(e) => { e.preventDefault(); commit(s) }}
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ActivitiesList — add/remove string items
// ---------------------------------------------------------------------------

interface ActivitiesListProps {
  activities: string[]
  onChange: (activities: string[]) => void
}

function ActivitiesList({ activities, onChange }: ActivitiesListProps) {
  const [draft, setDraft] = useState('')

  function handleAdd() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...activities, trimmed])
    setDraft('')
  }

  function handleDelete(index: number) {
    onChange(activities.filter((_, i) => i !== index))
  }

  return (
    <div className={styles.activitiesList}>
      <span className={styles.activitiesHeading}>Activities</span>
      {activities.length === 0 ? (
        <p className={styles.activitiesEmpty}>No activities yet.</p>
      ) : (
        <ul className={styles.activitiesUl}>
          {activities.map((act, i) => (
            <li key={i} className={styles.activityItem}>
              <span className={styles.activityText}>{act}</span>
              <button
                type="button"
                className={styles.activityDeleteBtn}
                onClick={() => handleDelete(i)}
                aria-label={`Delete activity: ${act}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.activityAddRow}>
        <input
          className={styles.activityInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New activity…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          aria-label="New activity"
        />
        <button
          type="button"
          className={styles.activityAddBtn}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
    </div>
  )
}
