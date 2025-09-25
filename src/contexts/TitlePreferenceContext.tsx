import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';

export type TitlePreference = 'name' | 'nativeName' | 'englishName';

export interface TitlePreferenceContextType {
  titlePreference: TitlePreference;
  setTitlePreference: (preference: TitlePreference) => void;
  loading: boolean;
}

export const TitlePreferenceContext = createContext<TitlePreferenceContextType | undefined>(undefined);

interface TitlePreferenceProviderProps {
  children: ReactNode;
}

export const TitlePreferenceProvider: React.FC<TitlePreferenceProviderProps> = ({ children }) => {
  const [titlePreference, setTitlePreference] = useState<TitlePreference>('name');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const response = await fetch('/api/settings?key=titlePreference');
        if (response.ok) {
          const data = await response.json();
          if (data.value) {
            setTitlePreference(data.value as TitlePreference);
          }
        }
      } catch (err) {
        console.error('Error fetching title preference in context:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPreference();
  }, []);

  return (
    <TitlePreferenceContext.Provider value={{ titlePreference, setTitlePreference, loading }}>
      {children}
    </TitlePreferenceContext.Provider>
  );
};

export const useTitlePreference = () => {
  const context = useContext(TitlePreferenceContext);
  if (context === undefined) {
    throw new Error('useTitlePreference must be used within a TitlePreferenceProvider');
  }
  return context;
};