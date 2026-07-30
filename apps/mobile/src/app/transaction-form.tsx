import { transactionSchema } from '@fintrack/shared/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/form/date-field';
import { Segmented } from '@/components/form/segmented';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { apiFetch } from '@/lib/api';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import { useTheme } from '@/hooks/use-theme';
import type { Account, Category, TransactionRow } from '@/lib/types';

type TxnType = 'expense' | 'income' | 'transfer';

interface Prefill extends TransactionRow {
  categoryId?: string;
  accountId?: string;
  toAccountId?: string | null;
}

export default function TransactionFormScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const prefill: Prefill | null = params.prefill ? JSON.parse(params.prefill) : null;
  const isEditing = !!prefill?.id;

  const [type, setType] = useState<TxnType>(prefill?.type ?? 'expense');
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : '');
  const [fee, setFee] = useState(prefill && prefill.fee > 0 ? String(prefill.fee) : '');
  const [accountId, setAccountId] = useState<string | null>(prefill?.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(prefill?.toAccountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(prefill?.categoryId ?? null);
  const [date, setDate] = useState(prefill?.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiFetch<Account[]>('/v1/accounts'),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/v1/categories'),
  });

  const accountOptions = (accounts ?? []).map((a) => ({
    value: a.id,
    label: `${a.icon ?? ''} ${a.name}`.trim(),
  }));
  const categoryOptions = (categories ?? [])
    .filter((c) => (type === 'transfer' ? true : c.type === type || c.type === 'both'))
    .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  }

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      isEditing
        ? apiFetch(`/v1/transactions/${prefill!.id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        : apiFetch('/v1/transactions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateAll();
      successFeedback();
      router.back();
    },
    onError: (error) => {
      errorFeedback();
      setErrors({ form: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/transactions/${prefill!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateAll();
      successFeedback();
      router.back();
    },
    onError: (error) => {
      errorFeedback();
      setErrors({ form: error.message });
    },
  });

  function handleSave() {
    const body = {
      type,
      amount,
      fee: fee || '0',
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId,
      date,
      description,
      tags: [],
    };

    const parsed = transactionSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0] ?? 'form')] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    saveMutation.mutate(parsed.data);
  }

  function handleDelete() {
    Alert.alert('Delete transaction', 'This also reverses its balance effect. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">
            {isEditing ? 'Edit transaction' : 'New transaction'}
          </ThemedText>

          <Segmented<TxnType>
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'transfer', label: 'Transfer' },
            ]}
            value={type}
            onChange={(next) => {
              setType(next);
              setCategoryId(null);
            }}
          />

          <TextField
            label="Amount"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            error={errors.amount}
          />

          <SelectField
            label={type === 'transfer' ? 'From account' : 'Account'}
            placeholder="Select an account"
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            error={errors.accountId}
          />

          {type === 'transfer' && (
            <SelectField
              label="To account"
              placeholder="Select destination account"
              options={accountOptions.filter((option) => option.value !== accountId)}
              value={toAccountId}
              onChange={setToAccountId}
              error={errors.toAccountId}
            />
          )}

          <SelectField
            label="Category"
            placeholder="Select a category"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            error={errors.categoryId}
          />

          <DateField label="Date" value={date} onChange={setDate} error={errors.date} />

          <TextField
            label="Fee (optional)"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={fee}
            onChangeText={setFee}
            error={errors.fee}
          />

          <TextField
            label="Description (optional)"
            placeholder="What was this for?"
            value={description}
            onChangeText={setDescription}
          />

          {errors.form && (
            <ThemedText type="small" style={styles.formError}>
              {errors.form}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: theme.text },
              (pressed || isSaving) && styles.pressed,
            ]}>
            {saveMutation.isPending ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {isEditing ? 'Save changes' : 'Add transaction'}
              </ThemedText>
            )}
          </Pressable>

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              disabled={isSaving}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete transaction
              </ThemedText>
            </Pressable>
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
  formError: {
    color: '#ef4444',
    textAlign: 'center',
  },
  saveButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  deleteButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  deleteText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
});
