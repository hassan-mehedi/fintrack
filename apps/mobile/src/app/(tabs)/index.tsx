import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { DashboardData, NetWorthPoint } from '@/lib/types';
import { ACCOUNT_CLASSIFICATION } from '@fintrack/shared/types';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank',
  mobile_banking: 'Mobile banking',
  cash: 'Cash',
  credit_card: 'Credit card',
  loan: 'Loan',
  custom: 'Custom',
  fdr: 'FDR',
  dps: 'DPS',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleString(undefined, { month: 'short' });
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function spendingDelta(total: number, previousTotal: number) {
  if (previousTotal <= 0) return { label: 'new', color: 'textSecondary' as const };
  const pct = ((total - previousTotal) / previousTotal) * 100;
  const arrow = pct >= 0 ? '↑' : '↓';
  const magnitude = Math.min(Math.abs(pct), 999).toFixed(0);
  return {
    label: `${arrow} ${magnitude}%`,
    color: pct >= 0 ? ('danger' as const) : ('success' as const),
  };
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const currency = user?.currency ?? 'BDT';

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${pad(daysInMonth)}`;

  function shiftMonth(delta: number) {
    const shifted = new Date(year, month - 1 + delta);
    setMonth(shifted.getMonth() + 1);
    setYear(shifted.getFullYear());
  }

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard', from],
    queryFn: () => apiFetch<DashboardData>(`/v1/dashboard?from=${from}&to=${to}`),
  });

  const { data: history } = useQuery({
    queryKey: ['net-worth-history'],
    queryFn: () => apiFetch<NetWorthPoint[]>('/v1/net-worth-history?months=6'),
  });

  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border };
  const savingsRate =
    data && data.monthlyIncome > 0
      ? ((data.monthlyIncome - data.monthlyExpense) / data.monthlyIncome) * 100
      : 0;
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
  const dailyAvg = data ? data.monthlyExpense / daysElapsed : 0;
  const forecast = data ? data.monthlyExpense + dailyAvg * (daysInMonth - daysElapsed) : 0;
  const forecastOverIncome = data ? forecast > data.monthlyIncome : false;
  const maxSpending = data ? Math.max(...data.spendingByCategory.map((s) => s.total), 1) : 1;
  const maxTrend = data
    ? Math.max(...data.monthlyTrend.flatMap((t) => [t.income, t.expense]), 1)
    : 1;

  const chartWidth =
    Math.min(Dimensions.get('window').width, MaxContentWidth) -
    Spacing.four * 2 -
    Spacing.three * 2 -
    48;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}>
          <View style={styles.headerRow}>
            <ThemedText type="heading">Dashboard</ThemedText>
            <Pressable
              onPress={() => router.push('/analytics')}
              hitSlop={8}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="smallBold" themeColor="primary">
                Analytics ›
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.monthNav}>
            <Pressable onPress={() => shiftMonth(-1)} style={styles.monthArrow} hitSlop={8}>
              <ThemedText type="subtitle">‹</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">
              {MONTH_NAMES[month - 1]} {year}
            </ThemedText>
            <Pressable
              onPress={() => shiftMonth(1)}
              style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
              disabled={isCurrentMonth}
              hitSlop={8}>
              <ThemedText type="subtitle">›</ThemedText>
            </Pressable>
          </View>

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
                    Expendable
                  </ThemedText>
                  <ThemedText
                    type="defaultBold"
                    themeColor="success"
                    adjustsFontSizeToFit
                    numberOfLines={1}>
                    {formatMoney(data.spendableBalance, currency)}
                  </ThemedText>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Bank, mobile & cash
                  </ThemedText>
                </ThemedView>
                <ThemedView type="backgroundElement" style={[styles.card, card, styles.half]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Non-spendable
                  </ThemedText>
                  <ThemedText type="defaultBold" adjustsFontSizeToFit numberOfLines={1}>
                    {formatMoney(data.totalSavings, currency)}
                  </ThemedText>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Locked in FDR/DPS
                  </ThemedText>
                </ThemedView>
              </View>

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

              {(data.totalSavings > 0 || data.monthlySavings > 0) && (
                <ThemedView type="backgroundElement" style={[styles.card, card]}>
                  <View style={styles.spendingHeader}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Saved this month
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor="success">
                      {formatMoney(data.monthlySavings, currency)}
                    </ThemedText>
                  </View>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Total in savings (FDR/DPS): {formatMoney(data.totalSavings, currency)}
                  </ThemedText>
                </ThemedView>
              )}

              {data.anomalies.length > 0 && (
                <Pressable
                  onPress={() => router.push('/analytics')}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type="backgroundElement"
                    style={[styles.card, card, { borderColor: theme.warning }]}>
                    <ThemedText type="smallBold">
                      ⚠️ {data.anomalies.length} unusually large expense
                      {data.anomalies.length === 1 ? '' : 's'} this month
                    </ThemedText>
                    <ThemedText type="tiny" themeColor="textSecondary" numberOfLines={1}>
                      Biggest: {data.anomalies[0].categoryIcon}{' '}
                      {data.anomalies[0].description || data.anomalies[0].categoryName} —{' '}
                      {formatMoney(data.anomalies[0].amount, currency)}. Tap for details.
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              )}

              {isCurrentMonth && (
                <ThemedView type="backgroundElement" style={[styles.card, card]}>
                  <View style={styles.spendingHeader}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Projected month-end spend
                    </ThemedText>
                    <ThemedText
                      type="smallBold"
                      themeColor={forecastOverIncome ? 'danger' : 'text'}>
                      {formatMoney(forecast, currency)}
                    </ThemedText>
                  </View>
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Based on your daily average with {daysInMonth - daysElapsed} days left
                    {forecastOverIncome ? ' — exceeds this month’s income' : ''}
                  </ThemedText>
                </ThemedView>
              )}

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
                            {account.currency ? ` · ${account.currency}` : ''}
                          </ThemedText>
                          <ThemedText
                            type="defaultBold"
                            themeColor={isLiability ? 'danger' : 'text'}
                            numberOfLines={1}>
                            {formatMoney(Number(account.balance), account.currency ?? currency)}
                          </ThemedText>
                          {isLiability && account.creditLimit && Number(account.creditLimit) > 0 && (
                            <ThemedText type="tiny" themeColor="success" numberOfLines={1}>
                              Available{' '}
                              {formatMoney(
                                Math.max(Number(account.creditLimit) - Number(account.balance), 0),
                                account.currency ?? currency
                              )}
                            </ThemedText>
                          )}
                          {account.secondaryCurrency && (
                            <ThemedText type="tiny" themeColor="textSecondary" numberOfLines={1}>
                              {account.secondaryCurrency}:{' '}
                              {formatMoney(
                                Number(account.secondaryBalance ?? 0),
                                account.secondaryCurrency
                              )}{' '}
                              owed
                              {account.secondaryCreditLimit &&
                              Number(account.secondaryCreditLimit) > 0
                                ? ` · avail ${formatMoney(
                                    Math.max(
                                      Number(account.secondaryCreditLimit) -
                                        Number(account.secondaryBalance ?? 0),
                                      0
                                    ),
                                    account.secondaryCurrency
                                  )}`
                                : ''}
                            </ThemedText>
                          )}
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
                    {data.spendingByCategory.map((item) => {
                      const delta = spendingDelta(item.total, item.previousTotal);
                      return (
                        <Pressable
                          key={item.categoryId}
                          onPress={() =>
                            router.push({
                              pathname: '/(tabs)/transactions',
                              params: { categoryId: item.categoryId, from, to },
                            })
                          }
                          style={({ pressed }) => [styles.spendingRow, pressed && styles.pressed]}>
                          <View style={styles.spendingHeader}>
                            <ThemedText type="small" numberOfLines={1} style={styles.spendingName}>
                              {item.categoryIcon} {item.categoryName}
                            </ThemedText>
                            <ThemedText type="tiny" themeColor={delta.color}>
                              {delta.label}
                            </ThemedText>
                            <ThemedText type="smallBold">
                              {formatMoney(item.total, currency)}
                            </ThemedText>
                          </View>
                          <View
                            style={[
                              styles.barTrack,
                              { backgroundColor: theme.backgroundSelected },
                            ]}>
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
                        </Pressable>
                      );
                    })}
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Change is vs the previous month. Tap a category to see its transactions.
                    </ThemedText>
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

              <ThemedText type="sectionTitle">Net worth history</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                {history && history.length >= 2 ? (
                  <>
                    <LineChart
                      data={history.map((point, i) => ({
                        value: point.netWorth,
                        label:
                          i % Math.max(Math.ceil(history.length / 4), 1) === 0
                            ? shortDate(point.date)
                            : '',
                      }))}
                      color1={theme.primary}
                      thickness={2}
                      hideDataPoints
                      curved
                      width={chartWidth}
                      height={140}
                      adjustToWidth
                      initialSpacing={0}
                      endSpacing={0}
                      disableScroll
                      yAxisThickness={0}
                      xAxisThickness={0}
                      noOfSections={4}
                      rulesColor={theme.border}
                      yAxisTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: theme.textSecondary, fontSize: 10 }}
                      formatYLabel={(label) => {
                        const value = Number(label);
                        return Math.abs(value) >= 1000
                          ? `${Math.round(value / 1000)}k`
                          : String(Math.round(value));
                      }}
                    />
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    A snapshot of your net worth is saved each day you open the app — the chart
                    appears once there are a few days of history.
                  </ThemedText>
                )}
              </ThemedView>

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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    paddingHorizontal: Spacing.three,
  },
  monthArrowDisabled: {
    opacity: 0.3,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  pressed: {
    opacity: 0.7,
  },
});
