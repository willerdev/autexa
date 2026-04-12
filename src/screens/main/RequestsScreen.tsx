import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { ServiceRequestRow } from '../../api/serviceRequests';
import { listMyServiceRequests } from '../../api/serviceRequests';
import { Card, PrimaryButton, ScreenScroll, SectionHeader } from '../../components';
import type { MainTabParamList } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { formatRelativeShort } from '../../utils/dateFormat';
import { colors, spacing } from '../../theme';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getErrorMessage } from '../../lib/errors';

function statusLabel(status: string): string {
  if (status === 'pending') return 'Pending';
  if (status === 'accepted') return 'Provider matched';
  if (status === 'completed') return 'Completed';
  return status;
}

export function RequestsScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Home'>>();
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await listMyServiceRequests();
    if (err) {
      setError(getErrorMessage(err));
      setRows([]);
    } else {
      setRows(data);
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
      <SectionHeader title="Your requests" />
      <PrimaryButton
        title="New service request"
        onPress={() => navigateAppStack(navigation, 'SelectService', undefined)}
        style={styles.cta}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.reqTitle}>{item.services?.name ?? 'Service'}</Text>
              <Text style={styles.reqMeta}>
                {statusLabel(item.status)} · {formatRelativeShort(item.created_at)}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No requests yet.</Text>}
        />
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  reqTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  reqMeta: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.textSecondary,
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
