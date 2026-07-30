import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { BudgetRow } from '@/lib/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function BudgetsScreen() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['budgets', month, year],
    queryFn: () => apiFetch<BudgetRow[]>(`/v1/budgets?month=${month}&year=${year}`),
  });

  function shiftMonth(delta: number) {
    const shifted = new Date(year, month - 1 + delta);
    setMonth(shifted.getMonth() + 1);
    setYear(shifted.getFullYear());
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Budgets</ThemedText>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/budget-form', params: { month: String(month), year: String(year) } })
            }
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.addButtonText}>
              + Add
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <ThemedText type="subtitle">‹</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">
            {MONTH_NAMES[month - 1]} {year}
          </ThemedText>
          <Pressable onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <ThemedText type="subtitle">›</ThemedText>
          </Pressable>
        </View>

        {isPending && <ActivityIndicator style={styles.loader} />}
        {error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {error.message}
          </ThemedText>
        )}
        {data?.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            No budgets for this month yet.
          </ThemedText>
        )}

        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => {
            const ratio = item.budgetAmount > 0 ? Math.min(item.spent / item.budgetAmount, 1) : 0;
            const overBudget = item.spent > item.budgetAmount;
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/budget-form',
                    params: {
                      month: String(month),
                      year: String(year),
                      prefill: JSON.stringify(item),
                    },
                  })
                }
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={styles.budgetRow}>
                  <View style={styles.budgetHeader}>
                    <ThemedText type="smallBold">
                      {item.categoryIcon} {item.categoryName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatMoney(item.spent, currency)} / {formatMoney(item.budgetAmount, currency)}
                    </ThemedText>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${ratio * 100}%`,
                          backgroundColor: overBudget ? '#ef4444' : item.categoryColor || '#3b82f6',
                        },
                      ]}
                    />
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  monthArrow: {
    paddingHorizontal: Spacing.four,
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
    paddingBottom: BottomTabInset + Spacing.three,
  },
  budgetRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  budgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});
