import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

function subscribe(callback: () => void) {
  const subscription = Appearance.addChangeListener(callback);
  return () => subscription.remove();
}

/**
 * To support static rendering, the server snapshot is always 'light'; the real
 * scheme is picked up on the client after hydration.
 */
export function useColorScheme() {
  return useSyncExternalStore(
    subscribe,
    () => Appearance.getColorScheme() ?? 'light',
    () => 'light' as const
  );
}
