import { recurringTransactionSchema } from '@fintrack/shared/validators';
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
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import type { Account, Category, RecurringRow } from '@/lib/types';

type RecType = 'expense' | 'income';
type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export default function RecurringFormScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const prefill: RecurringRow | null = params.prefill ? JSON.parse(params.prefill) : null;
  const isEditing = !!prefill?.id;

  const [type, setType] = useState<RecType>(prefill?.type ?? 'expense');
  const [amount, setAmount] = useState(prefill ? String(prefill.amount) : '');
  const [fee, setFee] = useState(prefill && prefill.fee > 0 ? String(prefill.fee) : '');
  const [accountId, setAccountId] = useState<string | null>(prefill?.accountId ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(prefill?.categoryId ?? null);
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [frequency, setFrequency] = useState<Frequency>(prefill?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(
    prefill?.startDate ?? format(new Date(), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(prefill?.endDate ?? '');
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
    .filter((c) => c.type === type || c.type === 'both')
    .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['recurring'] });
  }

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      isEditing
        ? apiFetch(`/v1/recurring/${prefill!.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch('/v1/recurring', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate();
      successFeedback();
      router.back();
    },
    onError: (error) => {
      errorFeedback();
      setErrors({ form: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/recurring/${prefill!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
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
      categoryId,
      description,
      frequency,
      startDate,
      endDate: endDate || null,
    };

    const parsed = recurringTransactionSchema.safeParse(body);
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
    Alert.alert('Delete recurring rule', 'Already-created transactions stay. Delete the rule?', [
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
            {isEditing ? 'Edit recurring rule' : 'New recurring rule'}
          </ThemedText>

          <Segmented<RecType>
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={(next) => {
              setType(next);
              setCategoryId(null);
            }}
          />

          <TextField
            label="Description"
            placeholder="e.g. Rent, Salary"
            value={description}
            onChangeText={setDescription}
            error={errors.description}
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
            label="Account"
            placeholder="Select an account"
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            error={errors.accountId}
          />

          <SelectField
            label="Category"
            placeholder="Select a category"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            error={errors.categoryId}
          />

          <Segmented<Frequency>
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
            value={frequency}
            onChange={setFrequency}
          />

          <DateField
            label="Start date"
            value={startDate}
            onChange={setStartDate}
            error={errors.startDate}
          />

          <DateField
            label="End date (optional)"
            value={endDate ?? ''}
            onChange={setEndDate}
            error={errors.endDate}
            clearable
            placeholder="No end date"
          />

          <TextField
            label="Fee (optional)"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={fee}
            onChangeText={setFee}
            error={errors.fee}
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
              { backgroundColor: theme.primary },
              (pressed || isSaving) && styles.pressed,
            ]}>
            {saveMutation.isPending ? (
              <ActivityIndicator color={theme.onPrimary} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                {isEditing ? 'Save changes' : 'Add rule'}
              </ThemedText>
            )}
          </Pressable>

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              disabled={isSaving}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete rule
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
