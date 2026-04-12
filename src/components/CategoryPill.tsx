import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../types';
import { colors, radius, spacing } from '../theme';

type Props = {
  item: Category;
  onPress?: () => void;
};

const iconMap: Record<Category['icon'], keyof typeof Ionicons.glyphMap> = {
  'car-sport-outline': 'car-sport-outline',
  'bus-outline': 'bus-outline',
  'medkit-outline': 'medkit-outline',
  'airplane-outline': 'airplane-outline',
};

export function CategoryPill({ item, onPress }: Props) {
  const content = (
    <View style={styles.inner}>
      <View style={styles.iconCircle}>
        <Ionicons name={iconMap[item.icon]} size={22} color={colors.primary} />
      </View>
      <Text style={styles.label}>{item.name}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    width: 92,
    minHeight: 92,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  pressed: {
    opacity: 0.9,
  },
  inner: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});
