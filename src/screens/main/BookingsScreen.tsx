import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { BookingRow } from '../../api/bookings';
import { listMyBookings } from '../../api/bookings';
import { Card, PrimaryButton, ScreenScroll, SectionHeader } from '../../components';
import type { Booking, MainTabParamList } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { colors, radius, spacing } from '../../theme';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getErrorMessage } from '../../lib/errors';

function mapRow(row: BookingRow): Booking {
  const st = row.status.toLowerCase();
  const status: Booking['status'] =
    st === 'confirmed' ? 'confirmed' : st === 'completed' ? 'completed' : 'pending';
  const d = new Date(row.date);
  const dateLabel = Number.isNaN(d.getTime())
    ? row.date
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return {
    id: row.id,
    serviceName: row.service_name ?? 'Booking',
    providerName: row.providers?.name ?? 'Provider',
    dateLabel,
    timeLabel: row.time,
    status,
    paymentStatus: row.payment_status ?? undefined,
  };
}

export function BookingsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Bookings'>>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await listMyBookings();
    if (err) {
      setError(getErrorMessage(err));
      setBookings([]);
    } else {
      setBookings(data.map(mapRow));
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <SectionHeader title="Bookings" />
      <PrimaryButton
        title="Book a service"
        onPress={() => navigateAppStack(navigation, 'SelectService', undefined)}
        style={styles.cta}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.dot} />
                <View style={styles.main}>
                  <Text style={styles.service}>{item.serviceName}</Text>
                  <Text style={styles.provider}>{item.providerName}</Text>
                  <Text style={styles.when}>
                    {item.dateLabel} · {item.timeLabel}
                  </Text>
                  {item.paymentStatus ? (
                    <Text style={styles.payment}>Payment: {item.paymentStatus}</Text>
                  ) : null}
                </View>
                <View style={[styles.badge, item.status === 'confirmed' && styles.badgeOk]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No bookings yet.</Text>}
        />
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 6,
    marginRight: spacing.md,
  },
  main: {
    flex: 1,
  },
  service: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  provider: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  when: {
    fontSize: 14,
    color: colors.text,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  payment: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  badgeOk: {
    backgroundColor: colors.primaryMuted,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'capitalize',
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  loader: {
    marginVertical: spacing.lg,
  },
});
