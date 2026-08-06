import { categorySchema } from '@fintrack/shared/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardScrollView } from '@/components/form/keyboard-scroll-view';
import { Segmented } from '@/components/form/segmented';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import type { Category } from '@/lib/types';

type CategoryType = 'income' | 'expense' | 'both';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function CategoryFormScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const prefill: Category | null = params.prefill ? JSON.parse(params.prefill) : null;
  const isEditing = !!prefill?.id;

  const [name, setName] = useState(prefill?.name ?? '');
  const [icon, setIcon] = useState(prefill?.icon ?? '🏷️');
  const [color, setColor] = useState(prefill?.color ?? COLORS[0]);
  const [type, setType] = useState<CategoryType>(prefill?.type ?? 'expense');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  }

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      isEditing
        ? apiFetch(`/v1/categories/${prefill!.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch('/v1/categories', { method: 'POST', body: JSON.stringify(body) }),
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
    mutationFn: () => apiFetch(`/v1/categories/${prefill!.id}`, { method: 'DELETE' }),
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
    const parsed = categorySchema.safeParse({ name, icon, color, type });
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
    Alert.alert('Delete category', 'Transactions in this category keep their records. Delete?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  const isSaving = saveMutation.isPending || deleteMutation.isPending;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{isEditing ? 'Edit category' : 'New category'}</ThemedText>

          <TextField
            label="Name"
            placeholder="e.g. Groceries"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />

          <TextField label="Icon" placeholder="Emoji" value={icon} onChangeText={setIcon} />

          <Segmented<CategoryType>
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'both', label: 'Both' },
            ]}
            value={type}
            onChange={setType}
          />

          <View style={styles.colorField}>
            <ThemedText type="small" themeColor="textSecondary">
              Color
            </ThemedText>
            <View style={styles.colorRow}>
              {COLORS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setColor(option)}
                  style={[
                    styles.swatch,
                    { backgroundColor: option },
                    color === option && { borderColor: theme.text, borderWidth: 2 },
                  ]}
                />
              ))}
            </View>
          </View>

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
                {isEditing ? 'Save changes' : 'Add category'}
              </ThemedText>
            )}
          </Pressable>

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              disabled={isSaving}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.deleteText}>
                Delete category
              </ThemedText>
            </Pressable>
          )}
        </KeyboardScrollView>
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
  colorField: {
    gap: Spacing.one,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
