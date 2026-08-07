import { SUPPORTED_CURRENCIES } from '@fintrack/shared/currencies';
import { financialAccountSchema } from '@fintrack/shared/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardScrollView } from '@/components/form/keyboard-scroll-view';
import { SelectField } from '@/components/form/select-field';
import { TextField } from '@/components/form/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorFeedback, successFeedback } from '@/lib/haptics';
import type { Account } from '@/lib/types';

const ACCOUNT_TYPES = [
  { value: 'bank', label: '🏦 Bank' },
  { value: 'mobile_banking', label: '📱 Mobile banking' },
  { value: 'cash', label: '💵 Cash' },
  { value: 'credit_card', label: '💳 Credit card' },
  { value: 'loan', label: '🧾 Loan' },
  { value: 'custom', label: '✨ Custom' },
  { value: 'fdr', label: '🏛️ FDR (Fixed Deposit)' },
  { value: 'dps', label: '🐷 DPS (Deposit Scheme)' },
];

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f97316', '#8b5cf6', '#14b8a6'];

const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name}`,
}));

export default function AccountFormScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ prefill?: string }>();
  const prefill: Account | null = params.prefill ? JSON.parse(params.prefill) : null;
  const isEditing = !!prefill?.id;

  const [name, setName] = useState(prefill?.name ?? '');
  const [type, setType] = useState<string | null>(prefill?.type ?? null);
  const [balance, setBalance] = useState(prefill ? String(prefill.balance) : '');
  const [icon, setIcon] = useState(prefill?.icon ?? '💰');
  const [color, setColor] = useState(prefill?.color ?? COLORS[0]);
  const [creditLimit, setCreditLimit] = useState(prefill?.creditLimit ?? '');
  const [accountCurrency, setAccountCurrency] = useState<string | null>(
    prefill?.currency ?? user?.currency ?? 'BDT'
  );
  const [secondaryCurrency, setSecondaryCurrency] = useState<string | null>(
    prefill?.secondaryCurrency ?? null
  );
  const [secondaryBalance, setSecondaryBalance] = useState(prefill?.secondaryBalance ?? '');
  const [secondaryCreditLimit, setSecondaryCreditLimit] = useState(
    prefill?.secondaryCreditLimit ?? ''
  );
  const [isDefault, setIsDefault] = useState(prefill?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const saveMutation = useMutation({
    mutationFn: (body: unknown) =>
      isEditing
        ? apiFetch(`/v1/accounts/${prefill!.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : apiFetch('/v1/accounts', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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
      name,
      type,
      balance: balance || '0',
      icon,
      color,
      defaultFeeRate: prefill?.defaultFeeRate ?? undefined,
      creditLimit: creditLimit || null,
      currency: accountCurrency,
      secondaryCurrency: secondaryCurrency,
      secondaryBalance: secondaryCurrency ? secondaryBalance || '0' : null,
      secondaryCreditLimit: secondaryCurrency ? secondaryCreditLimit || null : null,
      isDefault,
    };

    const parsed = financialAccountSchema.safeParse(body);
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{isEditing ? 'Edit account' : 'New account'}</ThemedText>

          <TextField
            label="Name"
            placeholder="e.g. bKash, DBBL Savings"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />

          <SelectField
            label="Type"
            placeholder="Select account type"
            options={ACCOUNT_TYPES}
            value={type}
            onChange={setType}
            error={errors.type}
          />

          <TextField
            label={isEditing ? 'Balance' : 'Starting balance'}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={balance}
            onChangeText={setBalance}
            error={errors.balance}
          />

          {(type === 'credit_card' || type === 'loan') && (
            <TextField
              label="Credit limit (optional)"
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={creditLimit ?? ''}
              onChangeText={setCreditLimit}
              error={errors.creditLimit}
            />
          )}

          <SelectField
            label="Currency"
            placeholder="Select currency"
            options={CURRENCY_OPTIONS}
            value={accountCurrency}
            onChange={setAccountCurrency}
            error={errors.currency}
          />

          {(type === 'credit_card' || type === 'loan') && (
            <SelectField
              label="Second currency (optional)"
              placeholder="None — single currency"
              options={CURRENCY_OPTIONS.filter((c) => c.value !== accountCurrency)}
              value={secondaryCurrency}
              onChange={setSecondaryCurrency}
              error={errors.secondaryCurrency}
            />
          )}

          {(type === 'credit_card' || type === 'loan') && secondaryCurrency && (
            <>
              <TextField
                label={`Amount owed (${secondaryCurrency})`}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={secondaryBalance ?? ''}
                onChangeText={setSecondaryBalance}
                error={errors.secondaryBalance}
              />
              <TextField
                label={`Credit limit (${secondaryCurrency})`}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={secondaryCreditLimit ?? ''}
                onChangeText={setSecondaryCreditLimit}
                error={errors.secondaryCreditLimit}
              />
            </>
          )}

          <TextField label="Icon" placeholder="Emoji" value={icon ?? ''} onChangeText={setIcon} />

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

          <View style={styles.switchRow}>
            <ThemedText>Default account</ThemedText>
            <Switch value={isDefault} onValueChange={setIsDefault} />
          </View>

          {errors.form && (
            <ThemedText type="small" style={styles.formError}>
              {errors.form}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSave}
            disabled={saveMutation.isPending}
            style={({ pressed }) => [
              styles.saveButton,
              { backgroundColor: theme.primary },
              (pressed || saveMutation.isPending) && styles.pressed,
            ]}>
            {saveMutation.isPending ? (
              <ActivityIndicator color={theme.onPrimary} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                {isEditing ? 'Save changes' : 'Add account'}
              </ThemedText>
            )}
          </Pressable>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  pressed: {
    opacity: 0.7,
  },
});
