import { useContext } from 'react'
import { AnimePaheCookieContext } from '../contexts/AnimePaheCookieContext'

export const useAnimePaheCookie = () => {
  const context = useContext(AnimePaheCookieContext)
  if (!context) {
    throw new Error('useAnimePaheCookie must be used within an AnimePaheCookieProvider')
  }
  return context
}
