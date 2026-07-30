import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  placeholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
}

export function SelectField({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
}: SelectFieldProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        onPress={() => setIsOpen(true)}
        style={[styles.trigger, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText themeColor={selected ? 'text' : 'textSecondary'}>
          {selected?.label ?? placeholder}
        </ThemedText>
      </Pressable>
      {error && (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      )}

      <Modal visible={isOpen} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)}>
          <ThemedView style={styles.sheet}>
            <ThemedText type="smallBold" style={styles.sheetTitle}>
              {label}
            </ThemedText>
            <FlatList
              data={options}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setIsOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    (pressed || item.value === value) && {
                      backgroundColor: theme.backgroundElement,
                    },
                  ]}>
                  <ThemedText>{item.label}</ThemedText>
                </Pressable>
              )}
            />
          </ThemedView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  trigger: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  error: {
    color: '#ef4444',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    maxHeight: '70%',
  },
  sheetTitle: {
    padding: Spacing.two,
  },
  option: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
});
