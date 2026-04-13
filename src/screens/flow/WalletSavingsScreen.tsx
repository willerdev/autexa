import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import { depositToSavings, fetchWallet, withdrawFromSavings } from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { colors, radius, spacing } from '../../theme';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function fmtMoney(n: number, currency: string) {
  return `${n.toLocaleString()} ${currency}`;
}

export function WalletSavingsScreen() {
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof fetchWallet>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
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
      Alert.alert('Savings', msg);
      setWallet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const currency = wallet?.currency ?? 'UGX';
  const savings = wallet?.savings_balance != null ? Number(wallet.savings_balance) : 0;
  const balance = wallet ? Number(wallet.balance) : 0;
  const locked = Boolean(wallet?.is_locked);

  async function onDeposit() {
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) return Alert.alert('Savings', 'Enter a valid amount.');
    try {
      setBusy(true);
      await depositToSavings({ amount: a, description: 'Move to savings' });
      setAmount('');
      await load();
      Alert.alert('Savings', `Moved ${fmtMoney(a, currency)} to savings.`);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Deposit failed';
      Alert.alert('Savings', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) return Alert.alert('Savings', 'Enter a valid amount.');
    try {
      setBusy(true);
      await withdrawFromSavings({ amount: a, description: 'Move to wallet' });
      setAmount('');
      await load();
      Alert.alert('Savings', `Moved ${fmtMoney(a, currency)} to wallet.`);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Withdraw failed';
      Alert.alert('Savings', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Savings</Text>
      <Text style={styles.sub}>Move money between Wallet and Savings. Savings contributions power challenges.</Text>

      {!isAutexaApiConfigured() ? (
        <Card>
          <Text style={styles.muted}>Configure EXPO_PUBLIC_AUTEXA_API_URL to use savings.</Text>
        </Card>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : wallet ? (
        <>
          <Card style={styles.card}>
            <Text style={styles.balanceLabel}>Savings balance</Text>
            <Text style={styles.balanceValue}>{fmtMoney(savings, currency)}</Text>
            <Text style={styles.muted}>Wallet: {fmtMoney(balance, currency)}</Text>
          </Card>

          <Card>
            <TextField
              label="Amount (UGX)"
              keyboardType="number-pad"
              placeholder="e.g. 50000"
              value={amount}
              onChangeText={setAmount}
              editable={!locked}
            />
            <PrimaryButton title="Move to savings" onPress={() => void onDeposit()} loading={busy} disabled={locked} />
            <PrimaryButton
              title="Move to wallet"
              variant="outline"
              onPress={() => void onWithdraw()}
              loading={busy}
              disabled={locked}
              style={styles.btnSpacer}
            />
          </Card>
        </>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  muted: { fontSize: 13, color: colors.textMuted },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  card: { marginBottom: spacing.md },
  balanceLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  balanceValue: { fontSize: 32, fontWeight: '900', color: colors.text, marginTop: spacing.xs, marginBottom: spacing.sm },
  btnSpacer: { marginTop: spacing.sm },
});

