import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import {
  ensureProviderProfile,
  getMyProviderProfile,
  listMyProviderBookings,
  updateProviderBookingStatus,
} from '../../api/providerDashboard';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';
import { useSessionStore } from '../../stores/sessionStore';

export function ProviderBookingsScreen() {
  const profile = useSessionStore((s) => s.profile);
  const isAdmin = (profile?.role ?? 'user') === 'admin';
  const [providerId, setProviderId] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!isAdmin) return;
    try {
      await ensureProviderProfile();
      const { data: p } = await getMyProviderProfile();
      if (!p?.id) {
        Alert.alert('Provider', 'Could not load provider profile.');
        return;
      }
      setProviderId(p.id);
      const { data, error } = await listMyProviderBookings(p.id);
      if (error) {
        Alert.alert('Bookings', getErrorMessage(error));
        return;
      }
      setRows(data);
    } catch (e) {
      Alert.alert('Bookings', getErrorMessage(e));
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
          <Text style={styles.deniedSub}>Provider bookings are only available to admin accounts.</Text>
        </Card>
      </ScreenScroll>
    );
  }

  const setStatus = async (id: string, status: string) => {
    setBusyId(id);
    try {
      const r = await updateProviderBookingStatus(id, status);
      if (r.error) {
        Alert.alert('Update booking', getErrorMessage(r.error));
        return;
      }
      setRows((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.head}>
        <Text style={styles.title}>Bookings</Text>
        <Pressable onPress={() => void load()} hitSlop={10}>
          <Ionicons name="refresh" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {rows.length ? (
        rows.map((b) => (
          <Card key={b.id} style={styles.card}>
            <Text style={styles.name}>{(b.users?.name ?? 'Customer').toString()}</Text>
            <Text style={styles.meta}>
              {(b.service_name ?? 'Service').toString()} · {b.date} · {b.time}
            </Text>
            <Text style={styles.meta}>
              Status: {(b.status ?? '').toString()} · Payment: {(b.payment_status ?? '').toString()}
            </Text>
            <View style={styles.actions}>
              <PrimaryButton
                title={busyId === b.id ? '…' : 'Accept'}
                onPress={() => void setStatus(b.id, 'confirmed')}
                disabled={busyId === b.id}
                style={styles.btn}
              />
              <PrimaryButton
                title={busyId === b.id ? '…' : 'Complete'}
                variant="outline"
                onPress={() => void setStatus(b.id, 'completed')}
                disabled={busyId === b.id}
                style={styles.btn}
              />
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptySub}>When customers book you, they’ll appear here.</Text>
        </Card>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  deniedTitle: { fontWeight: '900', color: colors.text, fontSize: 16, marginBottom: 6 },
  deniedSub: { color: colors.textMuted, fontWeight: '600', lineHeight: 20 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },
  card: { marginBottom: spacing.sm },
  name: { fontWeight: '900', color: colors.text, fontSize: 16 },
  meta: { marginTop: 6, color: colors.textSecondary, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1 },
  emptyTitle: { fontWeight: '900', color: colors.text, fontSize: 16, marginBottom: 6 },
  emptySub: { color: colors.textSecondary, fontWeight: '600', lineHeight: 20 },
});

