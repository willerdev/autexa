import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import {
  createProviderCategory,
  deleteProviderCategory,
  ensureProviderProfile,
  getMyProviderProfile,
  listMyProviderCategories,
  type ProviderCategoryRow,
} from '../../api/providerDashboard';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';
import { useSessionStore } from '../../stores/sessionStore';

export function ProviderCategoriesScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isAdmin = (profile?.role ?? 'user') === 'admin';
  const [providerId, setProviderId] = useState<string | null>(null);
  const [rows, setRows] = useState<ProviderCategoryRow[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const canAdd = useMemo(() => Boolean(name.trim()), [name]);

  const load = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await ensureProviderProfile();
      const { data: p } = await getMyProviderProfile();
      if (!p?.id) {
        Alert.alert('Provider', 'Could not load provider profile.');
        return;
      }
      setProviderId(p.id);
      const { data, error } = await listMyProviderCategories(p.id);
      if (error) {
        Alert.alert('Categories', getErrorMessage(error));
        return;
      }
      setRows(data);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!isAdmin) {
    return (
      <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
        <Card>
          <Text style={styles.deniedTitle}>Admin only</Text>
          <Text style={styles.deniedSub}>Provider categories are only available to admin accounts.</Text>
        </Card>
      </ScreenScroll>
    );
  }

  const add = async () => {
    if (!providerId || !canAdd) return;
    setBusy(true);
    try {
      const { data, error } = await createProviderCategory(providerId, name);
      if (error) {
        Alert.alert('Categories', getErrorMessage(error));
        return;
      }
      if (data) setRows((prev) => [data, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('Delete category', 'Remove this category?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const r = await deleteProviderCategory(id);
              if (r.error) {
                Alert.alert('Delete category', getErrorMessage(r.error));
                return;
              }
              setRows((prev) => prev.filter((x) => x.id !== id));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>Categories</Text>

      <Card style={styles.card}>
        <Text style={styles.section}>Create a category</Text>
        <TextField label="Category name" value={name} onChangeText={setName} />
        <PrimaryButton title={busy ? 'Working…' : 'Add category'} onPress={() => void add()} disabled={!canAdd || busy} style={styles.cta} />
      </Card>

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.section}>Your categories</Text>
          <Pressable onPress={() => void load()} hitSlop={10}>
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {rows.length ? (
          rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.rowText}>{r.name}</Text>
              <Pressable onPress={() => remove(r.id)} hitSlop={10}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No categories yet.</Text>
        )}
      </Card>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  deniedTitle: { fontWeight: '900', color: colors.text, fontSize: 16, marginBottom: 6 },
  deniedSub: { color: colors.textMuted, fontWeight: '600', lineHeight: 20 },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
  },
  card: { marginBottom: spacing.sm },
  section: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  cta: { marginTop: spacing.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: { fontWeight: '800', color: colors.text },
  empty: { color: colors.textSecondary, fontWeight: '600' },
});

