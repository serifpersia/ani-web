import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type TitlePreferenceContextType = {
  titlePreference: 'english' | 'native';
  setTitlePreference: (preference: 'english' | 'native') => void;
  loading: boolean;
};

export const TitlePreferenceContext = createContext<TitlePreferenceContextType | undefined>(undefined);

interface TitlePreferenceProviderProps {
  children: ReactNode;
}

export const TitlePreferenceProvider: React.FC<TitlePreferenceProviderProps> = ({ children }) => {
  const [titlePreference, setTitlePreference] = useState<'english' | 'native'>('english');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const response = await fetch('/api/settings?key=titlePreference');
        if (response.ok) {
          const data = await response.json();
          if (data.value) {
            setTitlePreference(data.value as 'english' | 'native');
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

export const useTitlePreference = (): TitlePreferenceContextType => {
  const context = useContext(TitlePreferenceContext);
  if (context === undefined) {
    throw new Error('useTitlePreference must be used within a TitlePreferenceProvider');
  }
  return context;
};