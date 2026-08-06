import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart, LineChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { MonthAnalytics, SubscriptionCandidate, YearOverview } from '@/lib/types';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const screenWidth = Math.min(Dimensions.get('window').width, MaxContentWidth);
const chartWidth = screenWidth - Spacing.four * 2 - Spacing.three * 2 - 48;

function compact(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
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

function cumulative(rows: { date: string; total: number }[], days: number) {
  const perDay = new Array<number>(days).fill(0);
  for (const row of rows) {
    const day = Number(row.date.slice(8, 10));
    if (day >= 1 && day <= days) perDay[day - 1] += row.total;
  }
  let running = 0;
  return perDay.map((value, i) => {
    running += value;
    return { value: running, label: (i + 1) % 5 === 0 ? String(i + 1) : '' };
  });
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export default function AnalyticsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';

  const { data, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => apiFetch<MonthAnalytics>('/v1/analytics'),
  });
  const { data: year } = useQuery({
    queryKey: ['analytics-year'],
    queryFn: () => apiFetch<YearOverview>('/v1/analytics/year'),
  });
  const { data: subscriptions } = useQuery({
    queryKey: ['analytics-subscriptions'],
    queryFn: () => apiFetch<SubscriptionCandidate[]>('/v1/analytics/subscriptions'),
  });

  const card = { borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border };
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const axisProps = {
    yAxisTextStyle: { color: theme.textSecondary, fontSize: 10 },
    xAxisLabelTextStyle: { color: theme.textSecondary, fontSize: 10 },
    rulesColor: theme.border,
    yAxisThickness: 0,
    xAxisThickness: 0,
    noOfSections: 4,
    formatYLabel: (label: string) => compact(Number(label)),
    disableScroll: true,
  } as const;

  function pointerConfig(color: string) {
    return {
      activatePointersOnLongPress: true,
      pointerStripColor: theme.border,
      pointerColor: color,
      radius: 4,
      autoAdjustPointerLabelPosition: true,
      pointerLabelWidth: 90,
      pointerLabelComponent: (items: { value: number }[]) => (
        <View style={[styles.pointerLabel, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText type="tiny">{formatMoney(items[0]?.value ?? 0, currency)}</ThemedText>
        </View>
      ),
    };
  }

  const expenseChange = data ? pctChange(data.monthReview.expense, data.monthReview.previousExpense) : null;
  const currentCumulative = data
    ? cumulative(data.dailySpend, daysInMonth).slice(0, now.getDate())
    : [];
  const prevCumulative = data ? cumulative(data.prevDailySpend, 31) : [];

  const maxDaily = data ? Math.max(...data.dailySpend.map((d) => d.total), 1) : 1;
  const dailyTotals = new Map(data?.dailySpend.map((d) => [Number(d.date.slice(8, 10)), d.total]));
  const leadingBlanks = new Date(now.getFullYear(), now.getMonth(), 1).getDay();

  const weekdayTotals = new Array<number>(7).fill(0);
  for (const row of data?.weekdaySplit ?? []) weekdayTotals[row.dow] = row.total;
  const weekendTotal = weekdayTotals[0] + weekdayTotals[6];
  const weekdayTotal = weekdayTotals.reduce((sum, v) => sum + v, 0) - weekendTotal;
  const maxDow = Math.max(...weekdayTotals, 1);

  const budgetBars = (data?.budgetHistory ?? []).flatMap((row) => [
    {
      value: row.budgeted,
      label: monthLabel(row.month),
      spacing: 2,
      frontColor: `${theme.textSecondary}59`,
    },
    {
      value: row.spent,
      frontColor: row.budgeted > 0 && row.spent > row.budgeted ? theme.danger : theme.primary,
    },
  ]);
  const hasBudgets = (data?.budgetHistory ?? []).some((row) => row.budgeted > 0);

  const savingsPoints = data
    ? [...data.savings.growth, ...data.savings.projected].map((row, i) => ({
        value: row.balance,
        label: i % 3 === 0 ? monthLabel(row.month) : '',
      }))
    : [];
  const showSavings = data ? data.savings.hasSavingsAccounts || data.savings.current > 0 : false;

  const yearBars = (year?.months ?? []).flatMap((row) => [
    {
      value: row.income,
      label: monthLabel(row.month),
      spacing: 1,
      frontColor: theme.success,
    },
    { value: row.expense, frontColor: theme.danger },
  ]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Analytics' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {isPending && <ActivityIndicator style={styles.loader} color={theme.primary} />}
          {error && (
            <ThemedText type="small" themeColor="danger">
              {error.message}
            </ThemedText>
          )}

          {data && (
            <>
              <ThemedText type="sectionTitle">Month in review</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                <View style={styles.reviewRow}>
                  <View style={styles.half}>
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Spent
                    </ThemedText>
                    <ThemedText type="defaultBold" numberOfLines={1} adjustsFontSizeToFit>
                      {formatMoney(data.monthReview.expense, currency)}
                    </ThemedText>
                    {expenseChange !== null && (
                      <ThemedText
                        type="tiny"
                        themeColor={expenseChange > 0 ? 'danger' : 'success'}>
                        {expenseChange > 0 ? '↑' : '↓'} {Math.abs(expenseChange).toFixed(0)}% vs
                        last month
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.half}>
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Biggest expense
                    </ThemedText>
                    {data.monthReview.biggestTransaction ? (
                      <>
                        <ThemedText type="defaultBold" numberOfLines={1} adjustsFontSizeToFit>
                          {formatMoney(data.monthReview.biggestTransaction.amount, currency)}
                        </ThemedText>
                        <ThemedText type="tiny" themeColor="textSecondary" numberOfLines={1}>
                          {data.monthReview.biggestTransaction.categoryIcon}{' '}
                          {data.monthReview.biggestTransaction.description ||
                            data.monthReview.biggestTransaction.categoryName}
                        </ThemedText>
                      </>
                    ) : (
                      <ThemedText type="tiny" themeColor="textSecondary">
                        No expenses yet
                      </ThemedText>
                    )}
                  </View>
                </View>
                {data.monthReview.topIncreases.length > 0 && (
                  <>
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Top increases vs last month
                    </ThemedText>
                    {data.monthReview.topIncreases.map((inc) => (
                      <View key={inc.categoryName} style={styles.listRow}>
                        <ThemedText type="small" numberOfLines={1} style={styles.listName}>
                          {inc.categoryIcon} {inc.categoryName}
                        </ThemedText>
                        <ThemedText type="smallBold" themeColor="danger">
                          +{formatMoney(inc.delta, currency)}
                        </ThemedText>
                      </View>
                    ))}
                  </>
                )}
              </ThemedView>

              {data.anomalies.length > 0 && (
                <ThemedView
                  type="backgroundElement"
                  style={[styles.card, card, { borderColor: theme.warning }]}>
                  <ThemedText type="smallBold">⚠️ Unusual spending</ThemedText>
                  {data.anomalies.map((anomaly) => (
                    <View key={anomaly.id} style={styles.listRow}>
                      <ThemedText type="small" numberOfLines={1} style={styles.listName}>
                        {anomaly.categoryIcon} {anomaly.description || anomaly.categoryName} ·{' '}
                        {shortDate(anomaly.date)}
                      </ThemedText>
                      <ThemedText type="smallBold">
                        {formatMoney(anomaly.amount, currency)}
                      </ThemedText>
                    </View>
                  ))}
                  <ThemedText type="tiny" themeColor="textSecondary">
                    Each is over 3× that category&apos;s six-month average.
                  </ThemedText>
                </ThemedView>
              )}

              <ThemedText type="sectionTitle">Cumulative spend</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                {currentCumulative.length > 0 ? (
                  <>
                    <LineChart
                      data={currentCumulative}
                      data2={prevCumulative}
                      color1={theme.primary}
                      color2={theme.textSecondary}
                      thickness={2}
                      thickness2={2}
                      hideDataPoints
                      curved
                      width={chartWidth}
                      height={160}
                      adjustToWidth
                      initialSpacing={0}
                      endSpacing={0}
                      showReferenceLine1={data.budgetTotal > 0}
                      referenceLine1Position={data.budgetTotal}
                      referenceLine1Config={{
                        color: theme.warning,
                        dashWidth: 6,
                        dashGap: 4,
                      }}
                      pointerConfig={pointerConfig(theme.primary)}
                      {...axisProps}
                    />
                    <View style={styles.legend}>
                      <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
                      <ThemedText type="tiny" themeColor="textSecondary">
                        This month
                      </ThemedText>
                      <View
                        style={[styles.legendDot, { backgroundColor: theme.textSecondary }]}
                      />
                      <ThemedText type="tiny" themeColor="textSecondary">
                        Last month
                      </ThemedText>
                      {data.budgetTotal > 0 && (
                        <>
                          <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
                          <ThemedText type="tiny" themeColor="textSecondary">
                            Budget
                          </ThemedText>
                        </>
                      )}
                    </View>
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Long-press the chart to inspect a day.
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No expenses recorded this month yet.
                  </ThemedText>
                )}
              </ThemedView>

              <ThemedText type="sectionTitle">Spending heatmap</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                <View style={styles.heatmapGrid}>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <View key={`h-${i}`} style={styles.heatCell}>
                      <ThemedText type="tiny" themeColor="textSecondary">
                        {label}
                      </ThemedText>
                    </View>
                  ))}
                  {Array.from({ length: leadingBlanks }, (_, i) => (
                    <View key={`b-${i}`} style={styles.heatCell} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const total = dailyTotals.get(i + 1) ?? 0;
                    const intensity = total > 0 ? 0.15 + 0.75 * (total / maxDaily) : 0;
                    return (
                      <View key={i + 1} style={styles.heatCell}>
                        <View
                          style={[
                            styles.heatDay,
                            card,
                            intensity > 0 && {
                              backgroundColor: `rgba(0, 165, 79, ${intensity})`,
                            },
                          ]}>
                          <ThemedText
                            type="tiny"
                            style={intensity > 0.55 ? styles.heatDayTextStrong : undefined}>
                            {i + 1}
                          </ThemedText>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <ThemedText type="tiny" themeColor="textSecondary">
                  Darker days cost you more.
                </ThemedText>
              </ThemedView>

              {data.categoryTrends.length > 0 && (
                <>
                  <ThemedText type="sectionTitle">Category trends</ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, card]}>
                    {data.categoryTrends.map((trend) => {
                      const latest = trend.months[trend.months.length - 1]?.total ?? 0;
                      const spark = trend.months.map((m) => ({ value: m.total }));
                      return (
                        <View key={trend.categoryId} style={styles.listRow}>
                          <ThemedText type="small" numberOfLines={1} style={styles.sparkName}>
                            {trend.categoryIcon} {trend.categoryName}
                          </ThemedText>
                          <LineChart
                            data={spark}
                            color1={trend.categoryColor || theme.primary}
                            thickness={2}
                            hideDataPoints
                            hideRules
                            hideYAxisText
                            yAxisThickness={0}
                            xAxisThickness={0}
                            width={90}
                            height={28}
                            adjustToWidth
                            initialSpacing={0}
                            endSpacing={0}
                            disableScroll
                          />
                          <ThemedText type="smallBold" style={styles.sparkValue}>
                            {formatMoney(latest, currency)}
                          </ThemedText>
                        </View>
                      );
                    })}
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Six-month spend per category, latest month on the right.
                    </ThemedText>
                  </ThemedView>
                </>
              )}

              <ThemedText type="sectionTitle">Budget vs actual</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                {hasBudgets ? (
                  <>
                    <BarChart
                      data={budgetBars}
                      barWidth={12}
                      spacing={18}
                      barBorderTopLeftRadius={3}
                      barBorderTopRightRadius={3}
                      width={chartWidth}
                      height={140}
                      adjustToWidth
                      {...axisProps}
                    />
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Gray is the budget, green is what you spent — red means over budget.
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No budgets set in the last six months.
                  </ThemedText>
                )}
              </ThemedView>

              <ThemedText type="sectionTitle">Savings growth</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                {showSavings ? (
                  <>
                    <LineChart
                      data={savingsPoints}
                      color1={theme.primary}
                      thickness={2}
                      hideDataPoints
                      curved
                      width={chartWidth}
                      height={160}
                      adjustToWidth
                      initialSpacing={0}
                      endSpacing={0}
                      lineSegments={[
                        {
                          startIndex: Math.max(data.savings.growth.length - 1, 0),
                          endIndex: savingsPoints.length - 1,
                          strokeDashArray: [4, 4],
                        },
                      ]}
                      pointerConfig={pointerConfig(theme.primary)}
                      {...axisProps}
                    />
                    <ThemedText type="tiny" themeColor="textSecondary">
                      FDR/DPS balance; the dashed part projects{' '}
                      {formatMoney(data.savings.monthlyAverage, currency)}/month forward.
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Create an FDR or DPS account and transfer money into it — growth and a
                    six-month projection will show up here.
                  </ThemedText>
                )}
              </ThemedView>

              <ThemedText type="sectionTitle">Weekday vs weekend</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                <ThemedText type="tiny" themeColor="textSecondary">
                  Weekdays {formatMoney(weekdayTotal, currency)} · weekends{' '}
                  {formatMoney(weekendTotal, currency)}
                </ThemedText>
                <View style={styles.dowChart}>
                  {DOW_ORDER.map((dow) => (
                    <View key={dow} style={styles.dowColumn}>
                      <View style={styles.dowBarArea}>
                        <View
                          style={[
                            styles.dowBar,
                            {
                              backgroundColor: theme.primary,
                              height: `${(weekdayTotals[dow] / maxDow) * 100}%`,
                            },
                          ]}
                        />
                      </View>
                      <ThemedText type="tiny" themeColor="textSecondary">
                        {DOW_NAMES[dow]}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </ThemedView>

              {data.topMerchants.length > 0 && (
                <>
                  <ThemedText type="sectionTitle">Top merchants</ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, card]}>
                    {data.topMerchants.map((merchant) => (
                      <View key={merchant.description} style={styles.listRow}>
                        <ThemedText type="small" numberOfLines={1} style={styles.listName}>
                          {merchant.description}{' '}
                          <ThemedText type="tiny" themeColor="textSecondary">
                            ×{merchant.count}
                          </ThemedText>
                        </ThemedText>
                        <ThemedText type="smallBold">
                          {formatMoney(merchant.total, currency)}
                        </ThemedText>
                      </View>
                    ))}
                  </ThemedView>
                </>
              )}

              <ThemedText type="sectionTitle">Possible subscriptions</ThemedText>
              <ThemedView type="backgroundElement" style={[styles.card, card]}>
                {subscriptions && subscriptions.length > 0 ? (
                  <>
                    {subscriptions.map((sub) => (
                      <View key={sub.description} style={styles.listRow}>
                        <View style={styles.listName}>
                          <ThemedText type="small" numberOfLines={1}>
                            {sub.description}
                          </ThemedText>
                          <ThemedText type="tiny" themeColor="textSecondary">
                            seen {sub.monthsSeen} months · last {shortDate(sub.lastDate)}
                          </ThemedText>
                        </View>
                        <ThemedText type="smallBold">
                          ~{formatMoney(sub.averageAmount, currency)}/mo
                        </ThemedText>
                      </View>
                    ))}
                    <ThemedText type="tiny" themeColor="textSecondary">
                      Repeating same-amount expenses you haven&apos;t marked as recurring.
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing detected — no repeating unmarked charges in the last six months.
                  </ThemedText>
                )}
              </ThemedView>

              {year && (
                <>
                  <ThemedText type="sectionTitle">{year.year} overview</ThemedText>
                  <ThemedView type="backgroundElement" style={[styles.card, card]}>
                    <View style={styles.reviewRow}>
                      <View style={styles.half}>
                        <ThemedText type="tiny" themeColor="textSecondary">
                          Income
                        </ThemedText>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {formatMoney(year.totals.income, currency)}
                        </ThemedText>
                        <ThemedText type="tiny" themeColor="textSecondary">
                          Expenses
                        </ThemedText>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {formatMoney(year.totals.expense, currency)}
                        </ThemedText>
                      </View>
                      <View style={styles.half}>
                        <ThemedText type="tiny" themeColor="textSecondary">
                          Saved (FDR/DPS)
                        </ThemedText>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {formatMoney(year.totals.saved, currency)}
                        </ThemedText>
                        <ThemedText type="tiny" themeColor="textSecondary">
                          Avg monthly burn
                        </ThemedText>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {formatMoney(year.totals.averageMonthlyExpense, currency)}
                        </ThemedText>
                      </View>
                    </View>
                    <BarChart
                      data={yearBars}
                      barWidth={7}
                      spacing={9}
                      barBorderTopLeftRadius={2}
                      barBorderTopRightRadius={2}
                      width={chartWidth}
                      height={140}
                      adjustToWidth
                      {...axisProps}
                    />
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
  },
  loader: {
    marginTop: Spacing.five,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  reviewRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  half: {
    flex: 1,
    gap: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  listName: {
    flex: 1,
  },
  sparkName: {
    width: 110,
  },
  sparkValue: {
    width: 90,
    textAlign: 'right',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  heatCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  heatDay: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatDayTextStrong: {
    color: '#ffffff',
  },
  dowChart: {
    flexDirection: 'row',
    gap: Spacing.two,
    height: 120,
  },
  dowColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dowBarArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  dowBar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  pointerLabel: {
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
