import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import { fetchWalletTransactions, type WalletTransaction } from '../../api/wallet';
import { Screen } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { colors, radius, spacing } from '../../theme';

const PAGE_SIZE = 20;

function fmtAmount(tx: WalletTransaction) {
  const n = Number(tx.amount);
  const cur = tx.currency || 'UGX';
  return `${n.toLocaleString()} ${cur}`;
}

function statusColor(status: string) {
  if (status === 'completed') return colors.textSecondary;
  if (status === 'failed') return colors.danger;
  return colors.star;
}

export function WalletTransactionsScreen() {
  const [rows, setRows] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (nextPage: number, mode: 'replace' | 'append') => {
    if (!isAutexaApiConfigured()) {
      setRows([]);
      setTotal(0);
      return;
    }
    const isAppend = mode === 'append';
    if (isAppend) setLoadingMore(true);
    else if (nextPage === 1) setLoading(true);
    try {
      const res = await fetchWalletTransactions({ page: nextPage, limit: PAGE_SIZE });
      setTotal(res.total);
      setPage(nextPage);
      setRows((prev) => (isAppend ? [...prev, ...res.data] : res.data));
    } catch (e) {
      if (!isAppend) {
        setRows([]);
        setTotal(0);
      }
      if (e instanceof AutexaApiError && e.status !== 0) {
        // surfaced via empty state; avoid spamming alerts on focus
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, 'replace');
    }, [loadPage]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadPage(1, 'replace');
  }, [loadPage]);

  const canLoadMore = rows.length < total;

  const onEndReached = useCallback(() => {
    if (!canLoadMore || loadingMore || loading) return;
    void loadPage(page + 1, 'append');
  }, [canLoadMore, loadPage, loadingMore, loading, page]);

  if (!isAutexaApiConfigured()) {
    return (
      <Screen style={styles.centered}>
        <Text style={styles.emptyTitle}>API not configured</Text>
        <Text style={styles.emptyBody}>Set EXPO_PUBLIC_AUTEXA_API_URL to load transactions.</Text>
      </Screen>
    );
  }

  if (loading && !rows.length) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right']}>
      <FlatList
        style={styles.list}
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReachedThreshold={0.3}
        onEndReached={onEndReached}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyBody}>Top up your wallet or pay a provider to see activity here.</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        contentContainerStyle={rows.length ? styles.listContent : styles.listContentEmpty}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.type}>{item.type.replace(/_/g, ' ')}</Text>
              <Text style={styles.amount}>{fmtAmount(item)}</Text>
            </View>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            <View style={styles.rowMeta}>
              <Text style={[styles.status, { color: statusColor(item.status) }]}>{item.status}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  listContent: { padding: spacing.md, paddingBottom: spacing.xl },
  listContentEmpty: { flexGrow: 1, padding: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  type: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  amount: { fontSize: 15, fontWeight: '800', color: colors.text },
  desc: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  rowMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  status: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  date: { fontSize: 12, color: colors.textMuted },
  emptyWrap: { paddingTop: spacing.xl * 2, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  footer: { paddingVertical: spacing.md },
});
