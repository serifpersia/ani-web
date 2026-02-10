import React, { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react'

export type TitlePreferenceContextType = {
  titlePreference: 'name' | 'nativeName' | 'englishName'
  setTitlePreference: (preference: 'name' | 'nativeName' | 'englishName') => void
  loading: boolean
}

export const TitlePreferenceContext = createContext<TitlePreferenceContextType | undefined>(
  undefined
)

interface TitlePreferenceProviderProps {
  children: ReactNode
}

export const TitlePreferenceProvider: React.FC<TitlePreferenceProviderProps> = ({ children }) => {
  const [titlePreference, setTitlePreference] = useState<'name' | 'nativeName' | 'englishName'>(
    'englishName'
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const response = await fetch('/api/settings?key=titlePreference')
        if (response.ok) {
          const data = await response.json()
          if (data.value) {
            setTitlePreference(data.value as 'english' | 'native')
          }
        }
      } catch (err) {
        console.error('Error fetching title preference in context:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPreference()
  }, [])

  const value = useMemo(
    () => ({ titlePreference, setTitlePreference, loading }),
    [titlePreference, loading]
  )

  return <TitlePreferenceContext.Provider value={value}>{children}</TitlePreferenceContext.Provider>
}

export const useTitlePreference = (): TitlePreferenceContextType => {
  const context = useContext(TitlePreferenceContext)
  if (context === undefined) {
    throw new Error('useTitlePreference must be used within a TitlePreferenceProvider')
  }
  return context
}
