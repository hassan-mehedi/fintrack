import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance, Platform } from 'react-native';

import { tokenStorage } from '@/lib/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'fintrack.themePreference';

interface ThemePreferenceValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  isLoading: boolean;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  preference: 'system',
  setPreference: () => {},
  isLoading: true,
});

function applyPreference(preference: ThemePreference) {
  if (Platform.OS === 'web') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    tokenStorage
      .get(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
          applyPreference(stored);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    applyPreference(next);
    tokenStorage.set(THEME_PREFERENCE_KEY, next);
  };

  return (
    <ThemePreferenceContext.Provider value={{ preference, setPreference, isLoading }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemePreferenceContext);
}
