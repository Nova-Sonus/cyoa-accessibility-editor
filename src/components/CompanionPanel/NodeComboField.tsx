import { useState, useRef, useEffect, useMemo, useId } from 'react'
import type { KeyboardEvent } from 'react'
import type { NodeType } from '../../types/adventure'
import { NODE_COLOURS } from '../../styles/tokens'
import styles from './CompanionPanel.module.css'

export interface NodeOption {
  id: string
  title: string
  node_type: NodeType
}

export interface NodeComboFieldProps {
  label: string
  value: string
  onChange: (nodeId: string) => void
  onCreateNew: () => void
  allNodes: NodeOption[]
}

export function NodeComboField({ label, value, onChange, onCreateNew, allNodes }: NodeComboFieldProps) {
  const uid = useId()
  const inputId = `${uid}-input`
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-option-${i}`
  const containerRef = useRef<HTMLDivElement>(null)

  const currentTitle = allNodes.find((n) => n.id === value)?.title ?? ''
  const [inputValue, setInputValue] = useState(currentTitle)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    setInputValue(allNodes.find((n) => n.id === value)?.title ?? '')
  }, [value, allNodes])

  const filtered = useMemo(() => {
    const q = inputValue.toLowerCase()
    return allNodes.filter((n) => n.title.toLowerCase().includes(q))
  }, [inputValue, allNodes])

  const totalOptions = filtered.length + 1
  const isOpen = open && totalOptions > 0

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
        >
          + Create new node…
        </li>
      </ul>
    </div>
  )
}
