import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { assignProviderToRequest } from '../../api';
import { loadProvidersWithOptionalAi, postAutoSelectBooking } from '../../api/aiMarketplace';
import { ProviderCard, ScreenScroll } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import type { AppStackParamList, Provider } from '../../types';
import { colors, spacing } from '../../theme';
import { addDays, toLocalDateString } from '../../utils/dateFormat';
import { getErrorMessage } from '../../lib/errors';
import { openCheckoutForBooking } from '../../utils/payments';

type Props = NativeStackScreenProps<AppStackParamList, 'ProviderList'>;

export function ProviderListScreen({ navigation, route }: Props) {
  const { serviceName, description, requestId } = route.params;
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const autoBusy = useRef(false);

  const filtered = useMemo(() => {
    if (!serviceName || serviceName === 'All services') return providers;
    const q = serviceName.toLowerCase();
    return providers.filter(
      (p) =>
        p.specialty.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        q.includes(p.specialty.toLowerCase()),
    );
  }, [providers, serviceName]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiNote(null);
    try {
      const { providers: list, aiNote: note } = await loadProvidersWithOptionalAi(
        serviceName,
        description ?? '',
      );
      setProviders(list);
      setAiNote(note);
    } catch (e) {
      setError(getErrorMessage(e));
      setProviders([]);
    }
    setLoading(false);
  }, [serviceName, description]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelect = async (item: Provider) => {
    try {
      if (requestId) {
        const { error: assignErr } = await assignProviderToRequest(requestId, item.id);
        if (assignErr) {
          setError(getErrorMessage(assignErr));
          return;
        }
      }
      navigation.navigate('BookingConfirm', {
        providerId: item.id,
        providerName: item.name,
        serviceName,
        requestId,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const onAutoSelect = async () => {
    if (autoBusy.current || !isAutexaApiConfigured()) {
      if (!isAutexaApiConfigured()) {
        Alert.alert('Autexa API', 'Set EXPO_PUBLIC_AUTEXA_API_URL and run the Node server (see /server).');
      }
      return;
    }
    autoBusy.current = true;
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const dateStr = toLocalDateString(addDays(start, 1));
      const { bookingId, providerName, aiReason } = await postAutoSelectBooking({
        date: dateStr,
        time: '10:30 AM',
        serviceName,
        amountCents: 4500,
      });
      Alert.alert(
        'Auto-select',
        `${providerName} was assigned.\n${aiReason}`,
        [
          {
            text: 'Pay now',
            onPress: async () => {
              const r = await openCheckoutForBooking(bookingId);
              if (!r.ok && r.message) Alert.alert('Payment', r.message);
            },
          },
          { text: 'OK' },
        ],
      );
    } catch (e) {
      Alert.alert('Auto-select failed', getErrorMessage(e));
    } finally {
      autoBusy.current = false;
    }
  };

  return (
    <ScreenScroll edges={['left', 'right']}>
      <Text style={styles.head}>{serviceName}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {aiNote ? <Text style={styles.aiNote}>✦ {aiNote}</Text> : null}
      <Text style={styles.sub}>Select a provider to schedule.</Text>
      {isAutexaApiConfigured() ? (
        <Pressable style={styles.autoBtn} onPress={() => void onAutoSelect()}>
          <Text style={styles.autoBtnText}>Auto-select best match</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.empty}>No matching providers.</Text>}
          renderItem={({ item }) => (
            <ProviderCard provider={item} onPress={() => void onSelect(item)} />
          )}
        />
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  head: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  desc: {
    marginTop: spacing.sm,
    fontSize: 15,
    color: colors.textSecondary,
  },
  aiNote: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  sub: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  autoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.md,
  },
  autoBtnText: {
    fontWeight: '700',
    color: colors.primaryDark,
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
