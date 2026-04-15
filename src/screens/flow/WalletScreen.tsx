import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import {
  depositToSavings,
  fetchTopupStatus,
  fetchWallet,
  fetchWalletTransactions,
  requestWalletTopup,
  requestWalletWithdraw,
  withdrawFromSavings,
  type WalletTransaction,
} from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll, TextField, WalletHomeSkeleton } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { resolveWalletMomoProvider } from '../../lib/ugandaMomo';
import { colors, radius, spacing } from '../../theme';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function fmtMoney(n: number, currency: string) {
  return `${n.toLocaleString()} ${currency}`;
}

function fmtTxAmount(tx: WalletTransaction) {
  const n = Number(tx.amount);
  const cur = tx.currency || 'UGX';
  return `${n.toLocaleString()} ${cur}`;
}

export function WalletScreen() {
  const navigation = useNavigation();
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof fetchWallet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [txRows, setTxRows] = useState<WalletTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [savingsBusy, setSavingsBusy] = useState(false);
  const [pollingTopupId, setPollingTopupId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'topup' | 'withdraw' | 'savings'>(null);

  const enterY = useRef(new Animated.Value(10)).current;
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const balancePulse = useRef(new Animated.Value(1)).current;

  const loadWallet = useCallback(async () => {
    if (!isAutexaApiConfigured()) {
      setWallet(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      setLoading(true);
      const w = await fetchWallet();
      setWallet(w);
    } catch (e) {
      const msg =
        e instanceof AutexaApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not load wallet';
      const hint =
        e instanceof AutexaApiError && e.status === 0
          ? ' Check EXPO_PUBLIC_AUTEXA_API_URL and your network.'
          : '';
      setLoadError(`${msg}${hint}`);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshTxPreview = useCallback(async () => {
    if (!isAutexaApiConfigured() || !wallet) {
      setTxRows([]);
      setTxLoading(false);
      return;
    }
    setTxLoading(true);
    try {
      const res = await fetchWalletTransactions({ page: 1, limit: 8 });
      setTxRows(res.data ?? []);
    } catch {
      setTxRows([]);
    } finally {
      setTxLoading(false);
    }
  }, [wallet]);

  useFocusEffect(
    useCallback(() => {
      void loadWallet();
    }, [loadWallet]),
  );

  useEffect(() => {
    void refreshTxPreview();
  }, [refreshTxPreview]);

  useFocusEffect(
    useCallback(() => {
      void refreshTxPreview();
    }, [refreshTxPreview]),
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(enterY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [enterOpacity, enterY]);

  useEffect(() => {
    if (!pollingTopupId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const s = await fetchTopupStatus(pollingTopupId);
        if (cancelled) return;
        if (s.status === 'success') {
          if (interval) clearInterval(interval);
          setPollingTopupId(null);
          Alert.alert(
            'Top-up',
            s.already_credited
              ? 'Your wallet is up to date.'
              : `Added ${fmtMoney(Number(s.amount ?? 0), wallet?.currency ?? 'UGX')}.`,
          );
          void loadWallet();
          void refreshTxPreview();
          return;
        }
        if (s.status === 'failed') {
          if (interval) clearInterval(interval);
          setPollingTopupId(null);
          Alert.alert('Top-up', s.reason ?? 'Payment failed or was declined.');
          return;
        }
        if (s.status === 'expired') {
          if (interval) clearInterval(interval);
          setPollingTopupId(null);
          Alert.alert('Top-up', 'This top-up request expired. Start a new one if you still want to add funds.');
        }
      } catch {
        /* keep polling */
      }
    };

    void tick();
    interval = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [pollingTopupId, loadWallet, refreshTxPreview, wallet?.currency]);

  const balance = wallet ? Number(wallet.balance) : 0;
  const savings = wallet && wallet.savings_balance != null ? Number(wallet.savings_balance) : 0;
  const currency = wallet?.currency ?? 'UGX';
  const locked = Boolean(wallet?.is_locked);

  useEffect(() => {
    if (!wallet) return;
    Animated.sequence([
      Animated.timing(balancePulse, { toValue: 1.015, duration: 100, useNativeDriver: true }),
      Animated.timing(balancePulse, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [wallet?.balance, balancePulse, wallet]);

  async function onTopup() {
    const a = num(amount);
    if (!phone.trim()) {
      Alert.alert('Top-up', 'Enter the mobile money number that will pay.');
      return;
    }
    if (!Number.isFinite(a)) {
      Alert.alert('Top-up', 'Enter a valid amount.');
      return;
    }
    try {
      setTopupBusy(true);
      const mmProvider = resolveWalletMomoProvider(phone.trim(), 'auto');
      const res = await requestWalletTopup({ amount: a, phone: phone.trim(), provider: mmProvider });
      await AsyncStorage.multiSet([
        ['autexa:mm_phone', phone.trim()],
        ['autexa:mm_provider', mmProvider],
      ]);
      setModal(null);
      Alert.alert('Top-up', res.message);
      setPollingTopupId(res.topupRequestId);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Top-up failed';
      Alert.alert('Top-up', msg);
    } finally {
      setTopupBusy(false);
    }
  }

  async function onWithdraw() {
    const a = num(amount);
    if (!phone.trim()) {
      Alert.alert('Withdraw', 'Enter the mobile money number to receive funds.');
      return;
    }
    if (!Number.isFinite(a)) {
      Alert.alert('Withdraw', 'Enter a valid amount.');
      return;
    }
    try {
      setWithdrawBusy(true);
      const res = await requestWalletWithdraw({
        amount: a,
        phone: phone.trim(),
        provider: resolveWalletMomoProvider(phone.trim(), 'auto'),
      });
      setModal(null);
      Alert.alert('Withdrawal', res.message);
      void loadWallet();
      void refreshTxPreview();
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Withdrawal failed';
      Alert.alert('Withdrawal', msg);
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function onSavingsToBucket() {
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) {
      Alert.alert('Savings', 'Enter a valid amount in UGX.');
      return;
    }
    try {
      setSavingsBusy(true);
      await depositToSavings({ amount: a, description: 'Move to savings' });
      setModal(null);
      setAmount('');
      Alert.alert('Savings', `Moved ${fmtMoney(a, currency)} to savings.`);
      void loadWallet();
      void refreshTxPreview();
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not move to savings';
      Alert.alert('Savings', msg);
    } finally {
      setSavingsBusy(false);
    }
  }

  async function onSavingsToWallet() {
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) {
      Alert.alert('Savings', 'Enter a valid amount in UGX.');
      return;
    }
    try {
      setSavingsBusy(true);
      await withdrawFromSavings({ amount: a, description: 'Move to wallet' });
      setModal(null);
      setAmount('');
      Alert.alert('Savings', `Moved ${fmtMoney(a, currency)} to wallet.`);
      void loadWallet();
      void refreshTxPreview();
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not move to wallet';
      Alert.alert('Savings', msg);
    } finally {
      setSavingsBusy(false);
    }
  }

  const modalBusy = topupBusy || withdrawBusy || savingsBusy;

  return (
    <ScreenScroll edges={['top', 'left', 'right']} contentContainerStyle={styles.scrollPad}>
      <Animated.View style={{ opacity: enterOpacity, transform: [{ translateY: enterY }] }}>
        <Text style={styles.screenTitle}>Wallet</Text>
      </Animated.View>

      {!isAutexaApiConfigured() ? (
        <Card style={styles.card}>
          <Text style={styles.muted}>Set EXPO_PUBLIC_AUTEXA_API_URL to use your wallet from this build.</Text>
        </Card>
      ) : null}

      {loadError && !loading ? (
        <Card style={styles.card}>
          <Text style={styles.errorText}>{loadError}</Text>
          <PrimaryButton title="Retry" onPress={() => void loadWallet()} style={styles.retryBtn} />
        </Card>
      ) : null}

      {loading && !wallet ? <WalletHomeSkeleton /> : null}

      {wallet ? (
        <>
          <Animated.View style={{ transform: [{ scale: balancePulse }] }}>
            <Card style={styles.heroCard}>
              <Text style={styles.heroLabel}>Balance</Text>
              <Text style={styles.heroAmount}>{fmtMoney(balance, currency)}</Text>
              {savings > 0 ? (
                <Text style={styles.heroSavings}>Savings · {fmtMoney(savings, currency)}</Text>
              ) : (
                <Text style={styles.heroSavingsMuted}>Savings · {fmtMoney(0, currency)}</Text>
              )}
              {locked ? (
                <View style={styles.lockBanner}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.danger} />
                  <Text style={styles.lockText}>
                    Locked{wallet.locked_reason ? `: ${wallet.locked_reason}` : ''}
                  </Text>
                </View>
              ) : null}
            </Card>
          </Animated.View>

          <View style={styles.iconRow}>
            <Pressable
              style={[styles.iconCircle, locked && styles.iconCircleDisabled]}
              onPress={() => !locked && setModal('topup')}
              disabled={locked || !isAutexaApiConfigured()}
              accessibilityRole="button"
              accessibilityLabel="Top up"
            >
              <Ionicons name="arrow-up-circle" size={34} color={colors.primary} />
            </Pressable>
            <Pressable
              style={[styles.iconCircle, locked && styles.iconCircleDisabled]}
              onPress={() => !locked && setModal('withdraw')}
              disabled={locked || !isAutexaApiConfigured()}
              accessibilityRole="button"
              accessibilityLabel="Withdraw"
            >
              <Ionicons name="arrow-down-circle" size={34} color={colors.primary} />
            </Pressable>
            <Pressable
              style={[styles.iconCircle, locked && styles.iconCircleDisabled]}
              onPress={() => !locked && setModal('savings')}
              disabled={locked || !isAutexaApiConfigured()}
              accessibilityRole="button"
              accessibilityLabel="Savings"
            >
              <MaterialCommunityIcons name="piggy-bank-outline" size={32} color={colors.primary} />
            </Pressable>
          </View>

          {pollingTopupId ? (
            <View style={styles.polling}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.pollingText}>Waiting for mobile money confirmation…</Text>
            </View>
          ) : null}

          <Text style={styles.section}>Transactions</Text>
          {txLoading && !txRows.length ? (
            <View style={styles.txLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : txRows.length === 0 ? (
            <Card>
              <Text style={styles.muted}>No activity yet. Deposit to get started.</Text>
            </Card>
          ) : (
            <Card style={styles.txCard}>
              {txRows.map((item, i) => (
                <View key={item.id}>
                  {i > 0 ? <View style={styles.txDivider} /> : null}
                  <View style={styles.txRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txType}>{item.type.replace(/_/g, ' ')}</Text>
                      {item.description ? <Text style={styles.txDesc}>{item.description}</Text> : null}
                      <Text style={styles.txDate}>{new Date(item.created_at).toLocaleString()}</Text>
                    </View>
                    <Text style={styles.txAmt}>{fmtTxAmount(item)}</Text>
                  </View>
                </View>
              ))}
              <Pressable
                style={styles.seeAll}
                onPress={() => (navigation as { navigate: (n: string) => void }).navigate('WalletTransactions')}
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </Pressable>
            </Card>
          )}
        </>
      ) : null}

      <Modal visible={modal != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !modalBusy && setModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {modal === 'topup' ? 'Top up' : modal === 'withdraw' ? 'Withdraw' : 'Savings'}
            </Text>
            {modal === 'savings' ? (
              <Text style={styles.modalHint}>Move money between your wallet balance and savings.</Text>
            ) : null}
            <TextField
              label="Amount (UGX)"
              keyboardType="number-pad"
              placeholder="e.g. 50000"
              value={amount}
              onChangeText={setAmount}
            />
            {modal === 'topup' || modal === 'withdraw' ? (
              <TextField
                label="Phone number"
                keyboardType="phone-pad"
                placeholder="256…"
                value={phone}
                onChangeText={setPhone}
              />
            ) : null}
            {modal === 'topup' ? (
              <PrimaryButton title="Request top-up" onPress={() => void onTopup()} loading={topupBusy} />
            ) : null}
            {modal === 'withdraw' ? (
              <PrimaryButton title="Withdraw to phone" onPress={() => void onWithdraw()} loading={withdrawBusy} />
            ) : null}
            {modal === 'savings' ? (
              <>
                <PrimaryButton title="Move to savings" onPress={() => void onSavingsToBucket()} loading={savingsBusy} />
                <PrimaryButton
                  title="Move to wallet"
                  variant="outline"
                  onPress={() => void onSavingsToWallet()}
                  loading={savingsBusy}
                  style={styles.modalSecondBtn}
                />
              </>
            ) : null}
            <PrimaryButton
              title="Cancel"
              variant="outline"
              onPress={() => !modalBusy && setModal(null)}
              style={styles.modalCancel}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  scrollPad: { paddingBottom: spacing.xxl },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  card: { marginBottom: spacing.md },
  errorText: { fontSize: 14, color: colors.danger, marginBottom: spacing.sm },
  retryBtn: { marginTop: spacing.xs },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  heroCard: {
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  heroAmount: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.sm,
    letterSpacing: -0.5,
  },
  heroSavings: { fontSize: 14, fontWeight: '600', color: colors.primaryDark, marginTop: spacing.sm },
  heroSavingsMuted: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignSelf: 'stretch',
  },
  lockText: { flex: 1, color: colors.danger, fontSize: 14, fontWeight: '600' },
  iconRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: 'rgba(23,94,163,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDisabled: { opacity: 0.45 },
  polling: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  pollingText: { flex: 1, fontSize: 14, color: colors.textSecondary },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  txLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  txCard: { paddingVertical: spacing.sm },
  txDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  txType: { fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  txDesc: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  txDate: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  txAmt: { fontSize: 15, fontWeight: '800', color: colors.text },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  seeAllText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalHint: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  modalSecondBtn: { marginTop: spacing.sm },
  modalCancel: { marginTop: spacing.sm },
});
