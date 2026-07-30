import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { RecurringRow } from '@/lib/types';

export default function RecurringScreen() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => apiFetch<RecurringRow[]>('/v1/recurring'),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['recurring'] });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch(`/v1/recurring/${id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
  });

  const processMutation = useMutation({
    mutationFn: () => apiFetch<{ created: number }>('/v1/recurring/process', { method: 'POST' }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Recurring' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => processMutation.mutate()}
            disabled={processMutation.isPending}
            style={({ pressed }) => [styles.processButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonText}>
              {processMutation.isPending ? 'Processing…' : 'Process due now'}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/recurring-form')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.buttonText}>
              + Add
            </ThemedText>
          </Pressable>
        </View>

        {processMutation.data && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            Created {processMutation.data.created} transaction(s).
          </ThemedText>
        )}
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
                  pathname: '/recurring-form',
                  params: { prefill: JSON.stringify(item) },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <View style={styles.rowInfo}>
                  <ThemedText type="smallBold">
                    {item.categoryIcon} {item.description}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.frequency} · {item.accountName} ·{' '}
                    {item.type === 'expense' ? '-' : '+'}
                    {formatMoney(item.amount, currency)}
                  </ThemedText>
                </View>
                <Switch
                  value={item.isActive}
                  onValueChange={(next) =>
                    toggleMutation.mutate({ id: item.id, isActive: next })
                  }
                />
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  processButton: {
    backgroundColor: '#22c55e',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addButton: {
    backgroundColor: '#3b82f6',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  buttonText: {
    color: '#ffffff',
  },
  message: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  loader: {
    marginTop: Spacing.five,
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
    gap: Spacing.two,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
