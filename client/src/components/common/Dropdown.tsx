import { useRef, useState, useEffect } from 'preact/hooks'
import './Dropdown.css'

interface Option {
  value: string
  label: string
}

interface Props {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (optValue: string) => {
    onChange(optValue)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={`dropdown-wrapper ${className}`} ref={wrapperRef}>
      <div className="dropdown-header" onClick={() => setIsOpen(!isOpen)}>
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="3 5 6 8 9 5" />
        </svg>
      </div>
      {isOpen && (
        <div className="dropdown-menu">
          <input
            type="text"
            placeholder="Search..."
            className="dropdown-search"
            value={searchTerm}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
          />
          <div className="dropdown-list">
            {filteredOptions.map((opt) => (
              <div
                key={opt.value}
                className={`dropdown-item ${opt.value === value ? 'active' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
