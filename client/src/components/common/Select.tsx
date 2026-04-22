import { JSX, ComponentChildren } from 'preact'
import { useId } from 'preact/hooks'
import './Select.css'

interface Option {
  value: string
  label: string
}

interface Props extends Omit<JSX.HTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: ComponentChildren
  options: Option[]
  error?: string
  onChange?: (value: string) => void
}

export function Select({
  label,
  options,
  error,
  className = '',
  id,
  value,
  onChange,
  ...props
}: Props) {
  const generatedId = useId()
  const selectId = id || `select-${generatedId}`

  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`form-select ${error ? 'form-input-error' : ''}`}
        value={value}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
