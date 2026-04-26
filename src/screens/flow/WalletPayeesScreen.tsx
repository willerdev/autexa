import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import {
  addWalletPayee,
  fetchWalletPayees,
  removeWalletPayee,
  transferToWalletPayee,
  type WalletPayee,
} from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { colors, radius, spacing } from '../../theme';

type AddMode = 'provider' | 'user';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function WalletPayeesScreen() {
  const [payees, setPayees] = useState<WalletPayee[]>([]);
  const [loading, setLoading] = useState(true);
  const [addLabel, setAddLabel] = useState('');
  const [addUuid, setAddUuid] = useState('');
  const [addMode, setAddMode] = useState<AddMode>('provider');
  const [addBusy, setAddBusy] = useState(false);
  const [sendPayee, setSendPayee] = useState<WalletPayee | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [sendBusy, setSendBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAutexaApiConfigured()) {
      setPayees([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetchWalletPayees();
      setPayees(res.data ?? []);
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not load payees';
      Alert.alert('Payees', msg);
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

  async function onAdd() {
    const label = addLabel.trim();
    const uuid = addUuid.trim();
    if (!label) {
      Alert.alert('Add payee', 'Enter a name you will recognize.');
      return;
    }
    if (!uuid) {
      Alert.alert('Add payee', addMode === 'provider' ? 'Enter the provider UUID.' : 'Enter the user UUID.');
      return;
    }
    try {
      setAddBusy(true);
      if (addMode === 'provider') {
        await addWalletPayee({ label, providerId: uuid });
      } else {
        await addWalletPayee({ label, payeeUserId: uuid });
      }
      setAddLabel('');
      setAddUuid('');
      await load();
      Alert.alert('Saved', 'Payee added to your list.');
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Could not add payee';
      Alert.alert('Add payee', msg);
    } finally {
      setAddBusy(false);
    }
  }

  function confirmRemove(p: WalletPayee) {
    Alert.alert('Remove payee', `Remove "${p.label}" from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void doRemove(p.id),
      },
    ]);
  }

  async function doRemove(id: string) {
    try {
      await removeWalletPayee(id);
      await load();
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Remove failed';
      Alert.alert('Payees', msg);
    }
  }

  async function onSend() {
    if (!sendPayee) return;
    const a = num(sendAmount);
    if (!Number.isFinite(a) || a < 1) {
      Alert.alert('Send', 'Enter a valid amount in UGX.');
      return;
    }
    try {
      setSendBusy(true);
      await transferToWalletPayee({
        payeeId: sendPayee.id,
        amount: a,
        description: sendNote.trim() || undefined,
      });
      setSendPayee(null);
      setSendAmount('');
      setSendNote('');
      Alert.alert('Sent', 'Transfer completed.');
    } catch (e) {
      const msg = e instanceof AutexaApiError ? e.message : 'Transfer failed';
      Alert.alert('Send', msg);
    } finally {
      setSendBusy(false);
    }
  }

  if (!isAutexaApiConfigured()) {
    return (
      <ScreenScroll edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Saved payees</Text>
        <Card>
          <Text style={styles.muted}>Configure EXPO_PUBLIC_AUTEXA_API_URL to manage payees.</Text>
        </Card>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Saved payees</Text>
      <Text style={styles.lead}>
        Add providers (by provider id from a booking) or other Gearup users (by their user id). Send money from your
        wallet without re-typing ids.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : payees.length === 0 ? (
        <Card style={styles.card}>
          <Text style={styles.muted}>No payees yet. Add one below.</Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          {payees.map((p, i) => (
            <View key={p.id}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.name}>{p.label}</Text>
                  {p.providers?.name ? <Text style={styles.sub}>{p.providers.name}</Text> : null}
                </View>
                <Pressable style={styles.iconBtn} onPress={() => setSendPayee(p)} accessibilityLabel="Send money">
                  <Ionicons name="arrow-forward-circle-outline" size={26} color={colors.primary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmRemove(p)} accessibilityLabel="Remove payee">
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </Pressable>
              </View>
              {i < payees.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </Card>
      )}

      <Text style={styles.section}>Add payee</Text>
      <Card>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeChip, addMode === 'provider' && styles.modeChipOn]}
            onPress={() => setAddMode('provider')}
          >
            <Text style={[styles.modeText, addMode === 'provider' && styles.modeTextOn]}>Provider id</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, addMode === 'user' && styles.modeChipOn]}
            onPress={() => setAddMode('user')}
          >
            <Text style={[styles.modeText, addMode === 'user' && styles.modeTextOn]}>User id</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {addMode === 'provider'
            ? 'Paste public.providers id (often visible in booking or provider flows).'
            : 'Paste the other person’s Supabase auth user UUID (advanced).'}
        </Text>
        <TextField label="Display name" value={addLabel} onChangeText={setAddLabel} placeholder="e.g. City Garage" />
        <TextField
          label={addMode === 'provider' ? 'Provider UUID' : 'User UUID'}
          value={addUuid}
          onChangeText={setAddUuid}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          autoCapitalize="none"
        />
        <PrimaryButton title="Save payee" onPress={() => void onAdd()} loading={addBusy} />
      </Card>

      <Modal visible={sendPayee != null} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !sendBusy && setSendPayee(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Send to {sendPayee?.label}</Text>
            <TextField label="Amount (UGX)" keyboardType="number-pad" value={sendAmount} onChangeText={setSendAmount} />
            <TextField label="Note (optional)" value={sendNote} onChangeText={setSendNote} />
            <PrimaryButton title="Send" onPress={() => void onSend()} loading={sendBusy} />
            <PrimaryButton
              title="Cancel"
              variant="outline"
              onPress={() => !sendBusy && setSendPayee(null)}
              style={styles.modalCancel}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  lead: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  card: { marginBottom: spacing.md },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  iconBtn: { padding: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  muted: { fontSize: 14, color: colors.textMuted },
  modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  modeChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  modeChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  modeText: { fontWeight: '700', color: colors.textSecondary },
  modeTextOn: { color: colors.primary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  modalCancel: { marginTop: spacing.sm },
});
