import { useId } from 'react'
import styles from './SelectField.module.css'

interface Props {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  disabled?: boolean
  id?: string
}

export function SelectField({ label, value, options, onChange, disabled = false, id }: Props) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  )
}
