import { createContext } from 'react'

export interface AnimePaheCookieContextType {
  isOpen: boolean
  openModal: (onSuccess?: () => void) => void
  closeModal: () => void
  onSuccess?: () => void
}

export const AnimePaheCookieContext = createContext<AnimePaheCookieContextType | undefined>(
  undefined
)
