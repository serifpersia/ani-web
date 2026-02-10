import React, { useState, useRef, useEffect } from 'react'
import styles from './SearchableSelect.module.css'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [wrapperRef])

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={styles.searchableSelect} ref={wrapperRef}>
      <div className={styles.selectHeader} onClick={() => setIsOpen(!isOpen)}>
        {selectedOption ? selectedOption.label : placeholder || 'Select...'}
      </div>
      {isOpen && (
        <div className={styles.dropdown}>
          <input
            type="text"
            placeholder="Search..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ul className={styles.optionsList}>
            {filteredOptions.map((option) => (
              <li
                key={option.value}
                className={styles.option}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SearchableSelect
