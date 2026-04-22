import { useState, useRef, useEffect, useMemo, useId } from 'react'
import type { KeyboardEvent } from 'react'
import styles from './CompanionPanel.module.css'

export interface AudioComboFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
}

export function AudioComboField({ label, value, onChange, suggestions }: AudioComboFieldProps) {
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
