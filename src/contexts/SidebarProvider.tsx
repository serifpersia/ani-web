import React, { useState, ReactNode, useMemo } from 'react';
import { SidebarContext } from './SidebarContext';

export const SidebarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const value = useMemo(() => ({ isOpen, setIsOpen, toggleSidebar }), [isOpen]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
};
