import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listMyNotifications, markNotificationRead, type UserNotificationRow } from '../../api/notifications';
import { Card, ScreenScroll, SectionHeader } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { formatRelativeShort } from '../../utils/dateFormat';
import { getErrorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<UserNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await listMyNotifications();
      if (err) {
        setRows([]);
        setError(getErrorMessage(err));
      } else {
        setRows(data);
      }
    } catch (e) {
      setRows([]);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onOpen = async (n: UserNotificationRow) => {
    if (!n.read_at) {
      const { error: err } = await markNotificationRead(n.id);
      if (!err) {
        setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      }
    }
    // If notification points to a booking/provider, jump to booking flow
    const data = (n.data ?? {}) as { booking_id?: string; provider_id?: string; service_name?: string };
    if (data.provider_id) {
      navigation.navigate('BookingConfirm', {
        providerId: data.provider_id,
        providerName: 'Provider',
        serviceName: data.service_name,
      });
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Pressable onPress={() => void load()} hitSlop={12}>
          <Text style={styles.refresh}>Refresh</Text>
        </Pressable>
      </View>
      <SectionHeader title="Notifications" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            return (
              <Pressable onPress={() => void onOpen(item)} style={({ pressed }) => [pressed && { opacity: 0.95 }]}>
                <Card style={[styles.card, unread && styles.unreadCard]}>
                  <View style={styles.row}>
                    {unread ? <View style={styles.dot} /> : <View style={styles.dotOff} />}
                    <View style={styles.main}>
                      <Text style={styles.title}>{item.title}</Text>
                      <Text style={styles.body}>{item.body}</Text>
                      <Text style={styles.time}>{formatRelativeShort(item.created_at)}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  back: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  refresh: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  card: {
    marginBottom: spacing.md,
  },
  unreadCard: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: colors.primary,
  },
  dotOff: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: colors.border,
  },
  main: { flex: 1 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  time: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
});

