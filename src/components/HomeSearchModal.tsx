import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { categories } from '../data/mockData';
import { colors, radius, spacing } from '../theme';
import { PrimaryButton } from './PrimaryButton';

export type HomeSearchFilters = {
  locationQuery: string;
  maxPriceDollars: string;
  minRating: number | null;
  categoryId: string | null;
};

export const defaultFilters: HomeSearchFilters = {
  locationQuery: '',
  maxPriceDollars: '',
  minRating: null,
  categoryId: null,
};

type Props = {
  visible: boolean;
  initial: HomeSearchFilters;
  onClose: () => void;
  onApply: (f: HomeSearchFilters) => void;
  onReset: () => void;
};

export function HomeSearchModal({ visible, initial, onClose, onApply, onReset }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<HomeSearchFilters>(initial);

  useEffect(() => {
    if (visible) setDraft(initial);
  }, [visible, initial]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Search & filters</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Area or address</Text>
          <TextInput
            value={draft.locationQuery}
            onChangeText={(locationQuery) => setDraft((d) => ({ ...d, locationQuery }))}
            placeholder="City, neighborhood, landmark…"
            placeholderTextColor={colors.textMuted}
            style={styles.field}
          />

          <View style={styles.row2}>
            <View style={styles.half}>
              <Text style={styles.label}>Start</Text>
              <TextInput
                placeholder="Date"
                placeholderTextColor={colors.textMuted}
                style={styles.field}
                editable={false}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>End</Text>
              <TextInput
                placeholder="Date"
                placeholderTextColor={colors.textMuted}
                style={styles.field}
                editable={false}
              />
            </View>
          </View>

          <Text style={styles.label}>Max price (USD)</Text>
          <Text style={styles.hint}>Set an upper limit; providers above it are hidden.</Text>
          <TextInput
            value={draft.maxPriceDollars}
            onChangeText={(maxPriceDollars) => setDraft((d) => ({ ...d, maxPriceDollars }))}
            placeholder="e.g. 120"
            placeholderTextColor={colors.textMuted}
            style={styles.field}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Minimum rating</Text>
          <View style={styles.ratingChips}>
            {[
              { label: 'Any', value: null as number | null },
              { label: '4.0+', value: 4 },
              { label: '4.5+', value: 4.5 },
            ].map(({ label, value }) => {
              const selected = draft.minRating === value;
              return (
                <Pressable
                  key={label}
                  onPress={() => setDraft((d) => ({ ...d, minRating: value }))}
                  style={[styles.filterChip, selected && styles.filterChipOn]}
                >
                  <Text style={[styles.filterChipText, selected && styles.filterChipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            <Pressable
              onPress={() => setDraft((d) => ({ ...d, categoryId: null }))}
              style={[styles.catChip, draft.categoryId == null && styles.catChipOn]}
            >
              <Text style={[styles.catChipText, draft.categoryId == null && styles.catChipTextOn]}>All</Text>
            </Pressable>
            {categories.map((c) => {
              const on = draft.categoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setDraft((d) => ({ ...d, categoryId: c.id }))}
                  style={[styles.catChip, on && styles.catChipOn]}
                >
                  <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pressable
            onPress={() => {
              setDraft(defaultFilters);
              onReset();
              onClose();
            }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
          <View style={styles.footerSearchWrap}>
            <PrimaryButton
              title="Search"
              style={styles.searchCta}
              onPress={() => {
                onApply(draft);
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  field: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.lg,
  },
  row2: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: 0,
  },
  half: {
    flex: 1,
  },
  ratingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterChipTextOn: {
    color: colors.surface,
  },
  catRow: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  catChipOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  catChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  catChipTextOn: {
    color: colors.surface,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  resetBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  footerSearchWrap: {
    flex: 1,
  },
  searchCta: {
    backgroundColor: colors.text,
  },
});
