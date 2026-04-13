import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import { fetchWalletPayees, transferToWalletPayee, type WalletPayee } from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { colors, radius, spacing } from '../../theme';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function WalletTransfersScreen() {
  const [payees, setPayees] = useState<WalletPayee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WalletPayee | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAutexaApiConfigured()) {
      setPayees([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const r = await fetchWalletPayees();
      setPayees(r.data ?? []);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not load payees';
      Alert.alert('Transfers', msg);
      setPayees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onSend() {
    if (!selected) return;
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) return Alert.alert('Send', 'Enter a valid amount.');
    try {
      setBusy(true);
      await transferToWalletPayee({ payeeId: selected.id, amount: a, description: note.trim() || undefined });
      setAmount('');
      setNote('');
      Alert.alert('Sent', `Transfer sent to ${selected.label}.`);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Transfer failed';
      Alert.alert('Send', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Transfers</Text>
      <Text style={styles.sub}>Send money to a saved payee from your Wallet.</Text>

      {!isAutexaApiConfigured() ? (
        <Card>
          <Text style={styles.muted}>Configure EXPO_PUBLIC_AUTEXA_API_URL to send transfers.</Text>
        </Card>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : payees.length === 0 ? (
        <Card>
          <Text style={styles.muted}>No payees yet. Add one in the Payees page first.</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <Text style={styles.section}>Choose payee</Text>
            {payees.map((p) => {
              const active = selected?.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelected(p)}
                  style={[styles.payeeRow, active && styles.payeeRowOn]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payeeName}>{p.label}</Text>
                    {p.providers?.name ? <Text style={styles.payeeSub}>{p.providers.name}</Text> : null}
                  </View>
                  {active ? <Text style={styles.on}>Selected</Text> : null}
                </Pressable>
              );
            })}
          </Card>

          <Card>
            <TextField label="Amount (UGX)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
            <TextField label="Note (optional)" value={note} onChangeText={setNote} />
            <PrimaryButton title="Send" onPress={() => void onSend()} loading={busy} disabled={!selected} />
          </Card>
        </>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  muted: { fontSize: 13, color: colors.textMuted },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  card: { marginBottom: spacing.md },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  payeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  payeeRowOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  payeeName: { fontSize: 15, fontWeight: '800', color: colors.text },
  payeeSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  on: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
});

