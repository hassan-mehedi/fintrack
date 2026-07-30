import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import type { Category } from '@/lib/types';

export default function CategoriesScreen() {
  const { data, isPending, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/v1/categories'),
  });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Categories' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push('/category-form')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.addButtonText}>
              + Add
            </ThemedText>
          </Pressable>
        </View>

        {isPending && <ActivityIndicator style={styles.loader} />}
        {error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {error.message}
          </ThemedText>
        )}

        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/category-form',
                  params: { prefill: JSON.stringify(item) },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <ThemedText type="smallBold">
                  {item.icon} {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.type}
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addButtonText: {
    color: '#ffffff',
  },
  loader: {
    marginTop: Spacing.five,
  },
  message: {
    paddingHorizontal: Spacing.four,
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  row: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.7,
  },
});
