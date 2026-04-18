import { useState, useRef, useEffect, useId } from 'react'
import styles from './ComboField.module.css'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  suggestions?: string[]
  placeholder?: string
  id?: string
}

export function ComboField({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = '',
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const uid = useId()
  const inputId = id ?? `${uid}-input`
  const listboxId = `${uid}-listbox`
  const optionId = (i: number) => `${uid}-option-${i}`
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(value.toLowerCase()) && s !== value,
  )

  const isOpen = open && filtered.length > 0

  useEffect(() => {
    setActiveIndex(-1)
  }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          onChange(filtered[activeIndex])
          setOpen(false)
          setActiveIndex(-1)
          e.preventDefault()
        }
        break
      case 'Escape':
        setOpen(false)
        setActiveIndex(-1)
        e.preventDefault()
        break
    }
  }

  function selectOption(s: string) {
    onChange(s)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div className={styles.field} ref={containerRef}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.inputWrapper}>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.chevronBtn}
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen((o) => !o)}
        >
          ▼
        </button>
      </div>
      <ul
        id={listboxId}
        role="listbox"
        className={styles.listbox}
        hidden={!isOpen}
      >
        {filtered.map((s, i) => (
          <li
            key={s}
            id={optionId(i)}
            role="option"
            aria-selected={i === activeIndex}
            className={`${styles.option} ${i === activeIndex ? styles.optionActive : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              selectOption(s)
            }}
          >
            {s}
          </li>
        ))}
      </ul>
    </div>
  )
}
