import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import { fetchTopupStatus, fetchWallet, requestWalletTopup, requestWalletWithdraw } from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';

type MomoProvider = 'mtn' | 'airtel';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function fmtMoney(n: number, currency: string) {
  return `${n.toLocaleString()} ${currency}`;
}

export function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof fetchWallet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [provider, setProvider] = useState<MomoProvider>('mtn');
  const [topupBusy, setTopupBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [pollingTopupId, setPollingTopupId] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!isAutexaApiConfigured()) {
      setWallet(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const w = await fetchWallet();
      setWallet(w);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not load wallet';
      Alert.alert('Wallet', msg);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWallet();
    }, [loadWallet]),
  );

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
            s.already_credited ? 'Your wallet is up to date.' : `Added ${fmtMoney(Number(s.amount ?? 0), wallet?.currency ?? 'UGX')}.`,
          );
          void loadWallet();
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
  }, [pollingTopupId, loadWallet, wallet?.currency]);

  const balance = wallet ? Number(wallet.balance) : 0;
  const currency = wallet?.currency ?? 'UGX';
  const locked = Boolean(wallet?.is_locked);

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
      const res = await requestWalletTopup({ amount: a, phone: phone.trim(), provider });
      await AsyncStorage.multiSet([
        ['autexa:mm_phone', phone.trim()],
        ['autexa:mm_provider', provider],
      ]);
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
      const res = await requestWalletWithdraw({ amount: a, phone: phone.trim(), provider });
      Alert.alert('Withdrawal', res.message);
      void loadWallet();
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Withdrawal failed';
      Alert.alert('Withdrawal', msg);
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Wallet</Text>
      {!isAutexaApiConfigured() ? (
        <Card style={styles.card}>
          <Text style={styles.muted}>Set EXPO_PUBLIC_AUTEXA_API_URL to use your Autexa wallet from this build.</Text>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : wallet ? (
        <Card style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceValue}>{fmtMoney(balance, currency)}</Text>
          {locked ? (
            <View style={styles.lockBanner}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.danger} />
              <Text style={styles.lockText}>
                Wallet locked{wallet.locked_reason ? `: ${wallet.locked_reason}` : ''}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Pressable
        style={styles.historyRow}
        onPress={() => navigation.navigate('WalletTransactions')}
        disabled={!isAutexaApiConfigured()}
      >
        <Ionicons name="receipt-outline" size={22} color={colors.text} />
        <Text style={styles.historyLabel}>Transaction history</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
      <Pressable
        style={styles.historyRow}
        onPress={() => navigation.navigate('WalletPayees')}
        disabled={!isAutexaApiConfigured()}
      >
        <Ionicons name="people-outline" size={22} color={colors.text} />
        <Text style={styles.historyLabel}>Saved payees</Text>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      <Text style={styles.section}>Mobile money</Text>
      <Card>
        <Text style={styles.hint}>
          Top-ups and withdrawals go through Flutterwave (Uganda mobile money). Use the same number registered on your MTN or Airtel wallet.
        </Text>
        <ProviderToggle value={provider} onChange={setProvider} disabled={locked || topupBusy || withdrawBusy} />
        <TextField
          label="Amount (UGX)"
          keyboardType="number-pad"
          placeholder="e.g. 50000"
          value={amount}
          onChangeText={setAmount}
          editable={!locked}
        />
        <TextField
          label="Phone number"
          keyboardType="phone-pad"
          placeholder="256…"
          value={phone}
          onChangeText={setPhone}
          editable={!locked}
        />
        <PrimaryButton
          title="Request top-up"
          onPress={() => void onTopup()}
          loading={topupBusy}
          disabled={locked || !isAutexaApiConfigured()}
        />
        <PrimaryButton
          title="Withdraw to phone"
          variant="outline"
          onPress={() => void onWithdraw()}
          loading={withdrawBusy}
          disabled={locked || !isAutexaApiConfigured()}
          style={styles.btnSpacer}
        />
        {pollingTopupId ? (
          <View style={styles.polling}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.pollingText}>Waiting for mobile money confirmation…</Text>
          </View>
        ) : null}
      </Card>

      <Text style={styles.section}>Pay via chat</Text>
      <Card>
        <Text style={styles.muted}>
          Ask Autexa for your balance, transaction history, saved payees, wallet-to-wallet sends, mobile-money
          withdrawals (after you confirm), or to remember a short wallet note for next time.
        </Text>
      </Card>
    </ScreenScroll>
  );
}

function ProviderToggle({
  value,
  onChange,
  disabled,
}: {
  value: MomoProvider;
  onChange: (p: MomoProvider) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      {(['mtn', 'airtel'] as const).map((p) => {
        const active = value === p;
        return (
          <Pressable
            key={p}
            disabled={disabled}
            onPress={() => onChange(p)}
            style={[styles.toggleChip, active && styles.toggleChipActive, disabled && styles.toggleDisabled]}
          >
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{p === 'mtn' ? 'MTN' : 'Airtel'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  card: { marginBottom: spacing.md },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  balanceCard: { marginBottom: spacing.md },
  balanceLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  balanceValue: { fontSize: 32, fontWeight: '800', color: colors.text, marginTop: spacing.xs },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  lockText: { flex: 1, color: colors.danger, fontSize: 14, fontWeight: '600' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  historyLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  hint: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  toggleChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  toggleChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  toggleDisabled: { opacity: 0.5 },
  toggleText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  toggleTextActive: { color: colors.primary },
  btnSpacer: { marginTop: spacing.sm },
  polling: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  pollingText: { flex: 1, fontSize: 14, color: colors.textSecondary },
});
