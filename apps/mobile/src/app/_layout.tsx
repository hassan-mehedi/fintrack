import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemePreferenceProvider } from '@/lib/theme-context';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const LightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.primary,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const DarkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.primary,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

function RootNavigator() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="transaction-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="account-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="budget-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recurring-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="category-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recurring" />
        <Stack.Screen name="categories" />
        <Stack.Screen name="assistant" />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedApp() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkNavTheme : LightNavTheme}>
      <RootNavigator />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemePreferenceProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemePreferenceProvider>
    </QueryClientProvider>
  );
}
