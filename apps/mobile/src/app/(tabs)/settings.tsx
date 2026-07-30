import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Segmented } from '@/components/form/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { useThemePreference, type ThemePreference } from '@/lib/theme-context';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="heading">Settings</ThemedText>

          <ThemedView type="backgroundElement" style={[styles.card, card]}>
            <ThemedText type="smallBold">{user?.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {user?.email}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Plan: {user?.plan} · Currency: {user?.currency}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={[styles.card, card]}>
            <ThemedText type="smallBold">Appearance</ThemedText>
            <Segmented options={THEME_OPTIONS} value={preference} onChange={setPreference} />
          </ThemedView>

          {(
            [
              { label: '🔁 Recurring transactions', href: '/recurring' },
              { label: '🏷️ Categories', href: '/categories' },
              { label: '🤖 Assistant', href: '/assistant' },
            ] as const
          ).map((item) => (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={[styles.linkRow, card]}>
                <ThemedText type="smallBold">{item.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  ›
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}

          <Pressable
            onPress={signOut}
            style={({ pressed }) => [
              styles.signOut,
              { backgroundColor: theme.danger },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.signOutText}>
              Sign out
            </ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  linkRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signOut: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  signOutText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
