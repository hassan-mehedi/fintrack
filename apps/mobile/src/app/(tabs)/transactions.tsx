import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { TransactionListResponse } from '@/lib/types';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['transactions', { page: 1 }],
    queryFn: () => apiFetch<TransactionListResponse>('/v1/transactions?page=1&limit=50'),
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Transactions</ThemedText>
          <Pressable
            onPress={() => router.push('/transaction-form')}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.addButtonText}>
              + Add
            </ThemedText>
          </Pressable>
        </View>

        {isPending && <ActivityIndicator style={styles.loader} />}
        {error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.title}>
            {error.message}
          </ThemedText>
        )}

        <FlatList
          data={data?.transactions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/transaction-form',
                  params: { prefill: JSON.stringify(item) },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.txnRow}>
                <View style={styles.txnInfo}>
                  <ThemedText type="smallBold">
                    {item.categoryIcon} {item.description || item.categoryName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.date} · {item.accountName}
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">
                  {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}
                  {formatMoney(item.amount, currency)}
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
  title: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
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
  pressed: {
    opacity: 0.7,
  },
  loader: {
    marginTop: Spacing.five,
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  txnRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  txnInfo: {
    flex: 1,
    gap: 2,
  },
});
