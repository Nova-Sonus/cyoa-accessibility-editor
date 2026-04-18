import { useId } from 'react'
import styles from './Field.module.css'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  large?: boolean
  disabled?: boolean
  id?: string
}

export function Field({ label, value, onChange, type = 'text', large = false, disabled = false, id }: Props) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const isTextarea = large || value.length > 80

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      {isTextarea ? (
        <textarea
          id={inputId}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      ) : (
        <input
          id={inputId}
          className={styles.input}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  )
}
