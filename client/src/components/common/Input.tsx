import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import './Input.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`

    return (
      <div className={`field ${className}`}>
        {label && (
          <label className="field-label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`form-input ${error ? 'form-input-error' : ''}`}
          {...props}
        />
        {error && <span className="field-error">{error}</span>}
      </div>
    )
  }
)
