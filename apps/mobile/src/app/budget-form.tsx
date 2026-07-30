import { budgetSchema } from '@fintrack/shared/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import type { BudgetRow, Category } from '@/lib/types';

export default function BudgetFormScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ month: string; year: string; prefill?: string }>();
  const prefill: BudgetRow | null = params.prefill ? JSON.parse(params.prefill) : null;
  const isEditing = !!prefill?.id;
  const month = Number(params.month);
  const year = Number(params.year);

  const [categoryId, setCategoryId] = useState<string | null>(prefill?.categoryId ?? null);
  const [amount, setAmount] = useState(prefill ? String(prefill.budgetAmount) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useQuery({
    queryKey: ['categories', 'expense'],
    queryFn: () => apiFetch<Category[]>('/v1/categories?type=expense'),
  });

  const categoryOptions = (categories ?? []).map((c) => ({
    value: c.id,
    label: `${c.icon} ${c.name}`,
  }));

  const saveMutation = useMutation({
    // createBudget upserts on (category, month, year), so it covers editing too
    mutationFn: (body: unknown) =>
      apiFetch('/v1/budgets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      successFeedback();
      router.back();
    },
    onError: (error) => {
      errorFeedback();
      setErrors({ form: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/budgets/${prefill!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      successFeedback();
      router.back();
    },
    onError: (error) => {
      errorFeedback();
      setErrors({ form: error.message });
    },
  });

  function handleSave() {
    const parsed = budgetSchema.safeParse({ categoryId, amount, month, year });
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
    Alert.alert('Delete budget', 'Remove this budget?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{isEditing ? 'Edit budget' : 'New budget'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {month}/{year}
          </ThemedText>

          <SelectField
            label="Category"
            placeholder="Select a category"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            error={errors.categoryId}
          />

          <TextField
            label="Monthly limit"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            error={errors.amount}
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
                {isEditing ? 'Save changes' : 'Add budget'}
              </ThemedText>
            )}
          </Pressable>

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              disabled={isSaving}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete budget
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
