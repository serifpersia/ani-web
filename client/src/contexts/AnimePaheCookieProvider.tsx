import React, { useState } from 'react'
import { AnimePaheCookieContext } from './AnimePaheCookieContext'

export const AnimePaheCookieProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [onSuccess, setOnSuccess] = useState<(() => void) | undefined>(undefined)

  const openModal = (successCallback?: () => void) => {
    setOnSuccess(() => successCallback)
    setIsOpen(true)
  }

  const closeModal = () => {
    setIsOpen(false)
    setOnSuccess(undefined)
  }

  return (
    <AnimePaheCookieContext.Provider value={{ isOpen, openModal, closeModal, onSuccess }}>
      {children}
    </AnimePaheCookieContext.Provider>
  )
}
