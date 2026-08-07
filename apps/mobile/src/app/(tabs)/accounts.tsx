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
import type { Account } from '@/lib/types';

export default function AccountsScreen() {
  const { user } = useAuth();
  const currency = user?.currency ?? 'BDT';

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiFetch<Account[]>('/v1/accounts'),
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Accounts</ThemedText>
          <Pressable
            onPress={() => router.push('/account-form')}
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
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/account-form',
                  params: { prefill: JSON.stringify(item) },
                })
              }
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.accountRow}>
                <View style={styles.accountInfo}>
                  <ThemedText type="smallBold">
                    {item.icon} {item.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.type}
                    {item.currency ? ` · ${item.currency}` : ''}
                    {item.isDefault ? ' · default' : ''}
                  </ThemedText>
                </View>
                <View style={styles.accountAmounts}>
                  <ThemedText type="smallBold">
                    {formatMoney(Number(item.balance), item.currency ?? currency)}
                  </ThemedText>
                  {item.creditLimit && Number(item.creditLimit) > 0 && (
                    <ThemedText type="tiny" themeColor="success">
                      Available{' '}
                      {formatMoney(
                        Math.max(Number(item.creditLimit) - Number(item.balance), 0),
                        item.currency ?? currency
                      )}
                    </ThemedText>
                  )}
                  {item.secondaryCurrency && (
                    <ThemedText type="tiny" themeColor="textSecondary">
                      {formatMoney(Number(item.secondaryBalance ?? 0), item.secondaryCurrency)}{' '}
                      owed
                      {item.secondaryCreditLimit && Number(item.secondaryCreditLimit) > 0
                        ? ` · avail ${formatMoney(
                            Math.max(
                              Number(item.secondaryCreditLimit) -
                                Number(item.secondaryBalance ?? 0),
                              0
                            ),
                            item.secondaryCurrency
                          )}`
                        : ''}
                    </ThemedText>
                  )}
                </View>
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
    backgroundColor: '#008339',
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
  accountRow: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountAmounts: {
    alignItems: 'flex-end',
    gap: 2,
  },
});
