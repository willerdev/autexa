import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listServices, type ServiceRow } from '../../api/services';
import { ScreenScroll, SearchBar } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<AppStackParamList, 'SelectService'>;

export function SelectServiceScreen({ navigation, route }: Props) {
  const preId = route.params?.preselectServiceId;
  const categoryId = route.params?.categoryId?.trim();
  const initialQuery = route.params?.query?.trim() ?? '';
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await listServices();
    if (err) {
      setError(getErrorMessage(err));
      setServices([]);
    } else {
      setServices(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!preId || !services.length) return;
    const bySlug = services.find((s) => s.slug === preId);
    const byId = services.find((s) => s.id === preId);
    setSelectedId((bySlug ?? byId)?.id);
  }, [preId, services]);

  const filtered = useMemo(() => {
    let list = services;
    if (categoryId) {
      const c = categoryId.toLowerCase();
      list = list.filter((s) => (s.category ?? '').toLowerCase() === c);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => (s.name ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [services, categoryId, query]);

  const selected = services.find((s) => s.id === selectedId);
  const emptyLabel = categoryId ? 'No services in this category.' : 'No services found.';

  return (
    <ScreenScroll edges={['left', 'right']}>
      <Text style={styles.lead}>Pick the service you need. You can add details on the next step.</Text>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Search services…" />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
          renderItem={({ item }) => {
            const isOn = item.id === selectedId;
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                style={[styles.row, isOn && styles.rowSelected]}
              >
                <View style={[styles.radio, isOn && styles.radioOn]} />
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  <Text style={styles.cat}>{item.category}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <Pressable
        style={[styles.continue, !selectedId && styles.continueDisabled]}
        disabled={!selectedId || !selected}
        onPress={() => {
          if (!selected) return;
          navigation.navigate('RequestDetails', { serviceId: selected.id, serviceName: selected.name });
        }}
      >
        <Text style={styles.continueText}>Continue</Text>
      </Pressable>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
  },
  radioOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  flex: { flex: 1 },
  itemTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  cat: {
    marginTop: 2,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  continue: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  continueDisabled: {
    opacity: 0.4,
  },
  continueText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
