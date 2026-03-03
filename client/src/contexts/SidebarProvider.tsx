import React, { useState, useMemo, useCallback } from 'react'
import { SidebarContext } from './SidebarContext'

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const value = useMemo(() => ({ isOpen, setIsOpen, toggleSidebar }), [isOpen, toggleSidebar])

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}
