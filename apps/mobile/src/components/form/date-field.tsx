import DateTimePicker from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  clearable?: boolean;
  placeholder?: string;
}

export function DateField({
  label,
  value,
  onChange,
  error,
  clearable,
  placeholder = 'Select a date',
}: DateFieldProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const parsed = value ? parseISO(value) : new Date();

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <Pressable
          onPress={() => setIsOpen(true)}
          style={[styles.trigger, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText themeColor={value ? 'text' : 'textSecondary'}>
            {value || placeholder}
          </ThemedText>
        </Pressable>
        {clearable && !!value && (
          <Pressable onPress={() => onChange('')} style={styles.clear}>
            <ThemedText type="small" themeColor="textSecondary">
              ✕
            </ThemedText>
          </Pressable>
        )}
      </View>
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}

      {isOpen && (
        <DateTimePicker
          value={parsed}
          mode="date"
          display={Platform.OS === 'android' ? 'calendar' : 'spinner'}
          onChange={(event, selected) => {
            setIsOpen(false);
            if (event.type === 'set' && selected) {
              onChange(format(selected, 'yyyy-MM-dd'));
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  trigger: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  clear: {
    padding: Spacing.two,
  },
  error: {
    color: '#ef4444',
  },
});
