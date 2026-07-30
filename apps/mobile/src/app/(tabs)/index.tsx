import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { DashboardData } from '@/lib/types';

export default function DashboardScreen() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/v1/dashboard'),
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
          <ThemedText type="title">Dashboard</ThemedText>

          {isPending && <ActivityIndicator style={styles.loader} />}
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error.message}
            </ThemedText>
          )}

          {data && (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Net worth
                </ThemedText>
                <ThemedText type="title">{formatMoney(data.netWorth, currency)}</ThemedText>
              </ThemedView>

              <View style={styles.row}>
                <ThemedView type="backgroundElement" style={[styles.card, styles.half]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Income
                  </ThemedText>
                  <ThemedText type="subtitle">
                    {formatMoney(data.monthlyIncome, currency)}
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={[styles.card, styles.half]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Expense
                  </ThemedText>
                  <ThemedText type="subtitle">
                    {formatMoney(data.monthlyExpense, currency)}
                  </ThemedText>
                </ThemedView>
              </View>

              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Recent transactions
              </ThemedText>
              {data.recentTransactions.map((txn) => (
                <ThemedView key={txn.id} type="backgroundElement" style={styles.txnRow}>
                  <View style={styles.txnInfo}>
                    <ThemedText type="smallBold">
                      {txn.categoryIcon} {txn.description || txn.categoryName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {txn.date} · {txn.accountName}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold">
                    {txn.type === 'expense' ? '-' : txn.type === 'income' ? '+' : ''}
                    {formatMoney(txn.amount, currency)}
                  </ThemedText>
                </ThemedView>
              ))}
            </>
          )}
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
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  loader: {
    marginTop: Spacing.five,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  half: {
    flex: 1,
  },
  sectionTitle: {
    marginTop: Spacing.three,
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
