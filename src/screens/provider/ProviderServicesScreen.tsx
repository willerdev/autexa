import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import {
  ensureProviderProfile,
  getMyProviderProfile,
  listMyProviderServices,
  type ProviderServiceRow,
} from '../../api/providerDashboard';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function ProviderServicesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [rows, setRows] = useState<(ProviderServiceRow & { provider_categories?: { name: string } | null })[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      await ensureProviderProfile();
      const { data: p } = await getMyProviderProfile();
      if (!p?.id) {
        Alert.alert('Provider', 'Could not load provider profile.');
        return;
      }
      setProviderId(p.id);
      const { data, error } = await listMyProviderServices(p.id);
      if (error) {
        Alert.alert('Services', getErrorMessage(error));
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

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.head}>
        <Text style={styles.title}>Services</Text>
        <Pressable onPress={() => void load()} hitSlop={10}>
          <Ionicons name="refresh" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <PrimaryButton title="Post a new service" onPress={() => navigation.navigate('ProviderServiceEdit')} disabled={busy || !providerId} />

      <View style={styles.list}>
        {rows.length ? (
          rows.map((s) => (
            <Card key={s.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text style={styles.name}>{s.title}</Text>
                  <Text style={styles.meta}>
                    {(s.provider_categories?.name ?? 'Uncategorized').toString()} · ${(s.price_cents / 100).toFixed(2)} · {s.is_active ? 'active' : 'paused'} · {(s.views_count ?? 0).toString()} views
                  </Text>
                </View>
                <Pressable onPress={() => navigation.navigate('ProviderServiceEdit', { serviceId: s.id })} hitSlop={10}>
                  <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
              {s.description ? <Text style={styles.desc}>{s.description}</Text> : null}
            </Card>
          ))
        ) : (
          <Card>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptySub}>Post your first service. You can use AI to generate a description from an image.</Text>
          </Card>
        )}
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },
  list: { marginTop: spacing.md, gap: spacing.sm },
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  name: { fontWeight: '900', color: colors.text, fontSize: 16 },
  meta: { marginTop: 6, color: colors.textSecondary, fontWeight: '700', textTransform: 'capitalize' },
  desc: { marginTop: spacing.sm, color: colors.textSecondary, fontWeight: '600', lineHeight: 20 },
  emptyTitle: { fontWeight: '900', color: colors.text, fontSize: 16, marginBottom: 6 },
  emptySub: { color: colors.textSecondary, fontWeight: '600', lineHeight: 20 },
});

