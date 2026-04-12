import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  onSubmit?: (text: string) => void;
  onFilterPress?: () => void;
};

export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onFilterPress,
  placeholder = 'What service do you need?',
}: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={20} color={colors.textMuted} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        returnKeyType="search"
        onSubmitEditing={() => onSubmit?.(value)}
      />
      {onFilterPress ? (
        <Pressable
          onPress={onFilterPress}
          hitSlop={10}
          style={({ pressed }) => [styles.filterBtn, pressed && styles.filterBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Ionicons name="options-outline" size={22} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  filterBtn: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  filterBtnPressed: {
    opacity: 0.65,
  },
});
