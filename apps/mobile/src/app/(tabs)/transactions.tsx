import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/form/date-field';
import { Segmented } from '@/components/form/segmented';
import { SelectField } from '@/components/form/select-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/format';
import type { Account, Category, TransactionListResponse } from '@/lib/types';

type TypeFilter = 'all' | 'income' | 'expense' | 'transfer';

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
];

export default function TransactionsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const currency = user?.currency ?? 'BDT';
  const params = useLocalSearchParams<{
    categoryId?: string;
    from?: string;
    to?: string;
  }>();

  const [showFilters, setShowFilters] = useState(false);
  const [type, setType] = useState<TypeFilter>('all');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');

  // Dashboard drill-down params act as filters until manually changed or cleared
  const effectiveCategoryId = params.categoryId || categoryId;
  const effectiveStartDate = params.from || startDate;
  const effectiveEndDate = params.to || endDate;

  function updateCategoryId(value: string) {
    setCategoryId(value);
    if (params.categoryId) router.setParams({ categoryId: '' });
  }

  function updateStartDate(value: string) {
    setStartDate(value);
    if (params.from) router.setParams({ from: '' });
  }

  function updateEndDate(value: string) {
    setEndDate(value);
    if (params.to) router.setParams({ to: '' });
  }

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiFetch<Account[]>('/v1/accounts'),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/v1/categories'),
  });

  const filterQuery = [
    type !== 'all' && `type=${type}`,
    effectiveCategoryId && `categoryId=${effectiveCategoryId}`,
    accountId && `accountId=${accountId}`,
    effectiveStartDate && `startDate=${effectiveStartDate}`,
    effectiveEndDate && `endDate=${effectiveEndDate}`,
    search && `search=${encodeURIComponent(search)}`,
  ]
    .filter(Boolean)
    .join('&');

  const activeCount = [
    type !== 'all',
    effectiveCategoryId,
    accountId,
    effectiveStartDate,
    effectiveEndDate,
    search,
  ].filter(Boolean).length;

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: [
      'transactions',
      {
        page: 1,
        type,
        categoryId: effectiveCategoryId,
        accountId,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        search,
      },
    ],
    queryFn: () =>
      apiFetch<TransactionListResponse>(
        `/v1/transactions?page=1&limit=50${filterQuery ? `&${filterQuery}` : ''}`
      ),
  });

  function clearFilters() {
    setType('all');
    setCategoryId('');
    setAccountId('');
    setStartDate('');
    setEndDate('');
    setSearchText('');
    setSearch('');
    router.setParams({ categoryId: '', from: '', to: '' });
  }

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...(categories ?? []).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
  ];
  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...(accounts ?? []).map((a) => ({ value: a.id, label: `${a.icon ?? ''} ${a.name}`.trim() })),
  ];

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

        <View style={styles.searchRow}>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search description…"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.searchInput,
              { color: theme.text, backgroundColor: theme.backgroundElement },
            ]}
          />
          <Pressable
            onPress={() => setShowFilters((visible) => !visible)}
            style={[
              styles.filterButton,
              {
                backgroundColor:
                  activeCount > 0 ? theme.backgroundSelected : theme.backgroundElement,
              },
            ]}>
            <ThemedText type="small">
              Filters{activeCount > 0 ? ` (${activeCount})` : ''} {showFilters ? '▴' : '▾'}
            </ThemedText>
          </Pressable>
        </View>

        {showFilters && (
          <View style={styles.filterPanel}>
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
            <View style={styles.filterRow}>
              <View style={styles.half}>
                <SelectField
                  label="Category"
                  placeholder="All categories"
                  options={categoryOptions}
                  value={effectiveCategoryId}
                  onChange={updateCategoryId}
                />
              </View>
              <View style={styles.half}>
                <SelectField
                  label="Account"
                  placeholder="All accounts"
                  options={accountOptions}
                  value={accountId}
                  onChange={setAccountId}
                />
              </View>
            </View>
            <View style={styles.filterRow}>
              <View style={styles.half}>
                <DateField
                  label="From"
                  value={effectiveStartDate}
                  onChange={updateStartDate}
                  clearable
                  placeholder="Any date"
                />
              </View>
              <View style={styles.half}>
                <DateField
                  label="To"
                  value={effectiveEndDate}
                  onChange={updateEndDate}
                  clearable
                  placeholder="Any date"
                />
              </View>
            </View>
            {activeCount > 0 && (
              <Pressable onPress={clearFilters} hitSlop={8}>
                <ThemedText type="small" themeColor="danger">
                  Clear all filters
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {isPending && <ActivityIndicator style={styles.loader} color={theme.primary} />}
        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.message}>
            {error.message}
          </ThemedText>
        )}
        {data && (
          <ThemedText type="tiny" themeColor="textSecondary" style={styles.message}>
            {data.total} transaction{data.total === 1 ? '' : 's'}
            {activeCount > 0 ? ' matching filters' : ''}
          </ThemedText>
        )}

        <FlatList
          data={data?.transactions ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            !isPending && data ? (
              <ThemedText type="small" themeColor="textSecondary">
                No transactions match your filters.
              </ThemedText>
            ) : null
          }
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
                <ThemedText
                  type="smallBold"
                  themeColor={
                    item.type === 'expense'
                      ? 'danger'
                      : item.type === 'income'
                        ? 'success'
                        : 'text'
                  }>
                  {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}
                  {formatMoney(item.amount, item.currency ?? item.accountCurrency ?? currency)}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  addButton: {
    backgroundColor: '#008339',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  addButtonText: {
    color: '#ffffff',
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  searchInput: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  filterButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
  },
  filterPanel: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  half: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  loader: {
    marginTop: Spacing.five,
  },
  message: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
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
