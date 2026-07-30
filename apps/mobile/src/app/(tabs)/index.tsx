import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { DashboardData } from '@/lib/types';
import { ACCOUNT_CLASSIFICATION } from '@fintrack/shared/types';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank',
  mobile_banking: 'Mobile banking',
  cash: 'Cash',
  credit_card: 'Credit card',
  loan: 'Loan',
  custom: 'Custom',
};

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleString(undefined, { month: 'short' });
}

function daysInCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const currency = user?.currency ?? 'BDT';

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardData>('/v1/dashboard'),
  });

  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border };
  const savingsRate =
    data && data.monthlyIncome > 0
      ? ((data.monthlyIncome - data.monthlyExpense) / data.monthlyIncome) * 100
      : 0;
  const dailyAvg = data ? data.monthlyExpense / daysInCurrentMonth() : 0;
  const maxSpending = data ? Math.max(...data.spendingByCategory.map((s) => s.total), 1) : 1;
  const maxTrend = data
    ? Math.max(...data.monthlyTrend.flatMap((t) => [t.income, t.expense]), 1)
    : 1;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
          <ThemedText type="heading">Dashboard</ThemedText>

          {isPending && <ActivityIndicator style={styles.loader} color={theme.primary} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {error.message}
            </ThemedText>
          )}

          {data && (
            <>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                <ThemedText type="small" themeColor="textSecondary">
                  Net worth
                </ThemedText>
                <ThemedText type="subtitle" adjustsFontSizeToFit numberOfLines={1}>
                  {formatMoney(data.netWorth, currency)}
                </ThemedText>
                <View style={styles.row}>
                  <View style={styles.half}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Assets
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="success" numberOfLines={1}>
                      {formatMoney(data.totalAssets, currency)}
                    </ThemedText>
                  </View>
                  <View style={styles.half}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Liabilities
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="danger" numberOfLines={1}>
                      {formatMoney(data.totalLiabilities, currency)}
                    </ThemedText>
                  </View>
                </View>
              </ThemedView>

              <View style={styles.row}>
                <ThemedView type="backgroundElement" style={[styles.card, card, styles.half]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Income
                  </ThemedText>
                  <ThemedText
                    type="defaultBold"
                    themeColor="success"
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {formatMoney(data.monthlyIncome, currency)}
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={[styles.card, card, styles.half]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Expense
                  </ThemedText>
                  <ThemedText
                    type="defaultBold"
                    themeColor="danger"
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {formatMoney(data.monthlyExpense, currency)}
                  </ThemedText>
                </ThemedView>
              </View>

              <View style={styles.row}>
                <ThemedView type="backgroundElement" style={[styles.statCard, card]}>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Savings rate
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    themeColor={savingsRate >= 0 ? 'success' : 'danger'}
                    numberOfLines={1}>
                    {savingsRate.toFixed(1)}%
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={[styles.statCard, card]}>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Fees paid
                  </ThemedText>
                  <ThemedText
                    type="smallBold"
                    themeColor="warning"
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {formatMoney(data.monthlyFees, currency)}
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={[styles.statCard, card]}>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Daily avg
                  </ThemedText>
                  <ThemedText type="smallBold" adjustsFontSizeToFit numberOfLines={1}>
                    {formatMoney(dailyAvg, currency)}
                  </ThemedText>
                </ThemedView>
              </View>

              {data.accounts.length > 0 && (
                <>
                  <ThemedText type="sectionTitle">Accounts</ThemedText>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.accountsRow}>
                    {data.accounts.map((account) => {
                      const isLiability = ACCOUNT_CLASSIFICATION[account.type] === 'liability';
                      return (
                        <ThemedView
                          key={account.id}
                          type="backgroundElement"
                          style={[styles.accountCard, card]}>
                          <ThemedText type="smallBold" numberOfLines={1}>
                            {account.icon ? `${account.icon} ` : ''}
                            {account.name}
                          </ThemedText>
                          <ThemedText type="tiny" themeColor="textSecondary">
                            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                          </ThemedText>
                          <ThemedText
                            type="defaultBold"
                            themeColor={isLiability ? 'danger' : 'text'}
                            numberOfLines={1}>
                            {formatMoney(Number(account.balance), currency)}
                          </ThemedText>
                        </ThemedView>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {data.spendingByCategory.length > 0 && (
                <>
                  <ThemedText type="sectionTitle">Spending by category</ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, card]}>
                    {data.spendingByCategory.map((item) => (
                      <View key={item.categoryId} style={styles.spendingRow}>
                        <View style={styles.spendingHeader}>
                          <ThemedText type="small" numberOfLines={1} style={styles.spendingName}>
                            {item.categoryIcon} {item.categoryName}
                          </ThemedText>
                          <ThemedText type="smallBold">
                            {formatMoney(item.total, currency)}
                          </ThemedText>
                        </View>
                        <View
                          style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                backgroundColor: item.categoryColor || theme.primary,
                                width: `${Math.max((item.total / maxSpending) * 100, 2)}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    ))}
                  </ThemedView>
                </>
              )}

              {data.monthlyTrend.length > 0 && (
                <>
                  <ThemedText type="sectionTitle">6-month trend</ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, card]}>
                    <View style={styles.trendChart}>
                      {data.monthlyTrend.map((point) => (
                        <View key={point.month} style={styles.trendColumn}>
                          <View style={styles.trendBars}>
                            <View
                              style={[
                                styles.trendBar,
                                {
                                  backgroundColor: theme.success,
                                  height: `${Math.max((point.income / maxTrend) * 100, 1)}%`,
                                },
                              ]}
                            />
                            <View
                              style={[
                                styles.trendBar,
                                {
                                  backgroundColor: theme.danger,
                                  height: `${Math.max((point.expense / maxTrend) * 100, 1)}%`,
                                },
                              ]}
                            />
                          </View>
                          <ThemedText type="tiny" themeColor="textSecondary">
                            {monthLabel(point.month)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                    <View style={styles.legend}>
                      <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
                      <ThemedText type="tiny" themeColor="textSecondary">
                        Income
                      </ThemedText>
                      <View style={[styles.legendDot, { backgroundColor: theme.danger }]} />
                      <ThemedText type="tiny" themeColor="textSecondary">
                        Expense
                      </ThemedText>
                    </View>
                  </ThemedView>
                </>
              )}

              <ThemedText type="sectionTitle">Recent transactions</ThemedText>
              {data.recentTransactions.map((txn) => (
                <ThemedView key={txn.id} type="backgroundElement" style={[styles.txnRow, card]}>
                  <View style={styles.txnInfo}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {txn.categoryIcon} {txn.description || txn.categoryName}
                    </ThemedText>
                    <ThemedText type="tiny" themeColor="textSecondary">
                      {txn.date} · {txn.accountName}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="smallBold"
                    themeColor={
                      txn.type === 'expense' ? 'danger' : txn.type === 'income' ? 'success' : 'text'
                    }>
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
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  loader: {
    marginTop: Spacing.five,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.two,
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  half: {
    flex: 1,
  },
  accountsRow: {
    gap: Spacing.two,
  },
  accountCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
    minWidth: 150,
    maxWidth: 220,
  },
  spendingRow: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  spendingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  spendingName: {
    flex: 1,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  trendChart: {
    flexDirection: 'row',
    height: 140,
    gap: Spacing.two,
  },
  trendColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  trendBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  trendBar: {
    width: 10,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    justifyContent: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: Spacing.two,
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
