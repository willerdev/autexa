import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import {
  createWalletPaymentLink,
  fetchWalletPaymentLinks,
  setWalletPaymentLinkActive,
  type WalletPaymentLinkRow,
} from '../../api/wallet';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import { env, isAutexaApiConfigured } from '../../config/env';
import { colors, radius, spacing } from '../../theme';

function payUrl(slug: string) {
  const base = env.webAppUrl;
  if (!base) return `(Set EXPO_PUBLIC_WEB_APP_URL)/pay/${slug}`;
  return `${base.replace(/\/$/, '')}/pay/${slug}`;
}

export function WalletPaymentLinksScreen() {
  const [rows, setRows] = useState<WalletPaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [suggested, setSuggested] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAutexaApiConfigured()) {
      setRows([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const r = await fetchWalletPaymentLinks();
      setRows(r.data ?? []);
    } catch (e) {
      Alert.alert('Payment links', e instanceof AutexaApiError ? e.message : 'Could not load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onCreate() {
    const sug = suggested.trim() ? Number(suggested.replace(/,/g, '')) : null;
    if (sug != null && (!Number.isFinite(sug) || sug < 1000)) {
      Alert.alert('Payment links', 'Fixed amount must be at least 1,000 UGX or leave empty.');
      return;
    }
    try {
      setBusy(true);
      const row = await createWalletPaymentLink({
        title: title.trim() || undefined,
        suggestedAmountUgx: sug,
      });
      setRows((prev) => [row, ...prev]);
      setTitle('');
      setSuggested('');
      const url = payUrl(row.slug);
      Alert.alert('Link created', url, [
        { text: 'Copy', onPress: () => void Clipboard.setStringAsync(url) },
        { text: 'Share', onPress: () => void Share.share({ message: `Pay me on Autexa: ${url}` }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('Payment links', e instanceof AutexaApiError ? e.message : 'Could not create');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(slug: string) {
    const url = payUrl(slug);
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied', url);
  }

  async function deactivate(id: string) {
    try {
      await setWalletPaymentLinkActive(id, false);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, active: false } : r)));
    } catch (e) {
      Alert.alert('Payment links', e instanceof AutexaApiError ? e.message : 'Could not update');
    }
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Payment links</Text>
      <Text style={styles.sub}>
        Anyone with the link can send mobile money to your Autexa wallet. They do not need the app. Set a fixed amount
        to require an exact sum.
      </Text>
      {!env.webAppUrl ? (
        <Card style={styles.card}>
          <Text style={styles.warn}>
            Set EXPO_PUBLIC_WEB_APP_URL (your public web app URL) so shared links open the payment page in a browser.
          </Text>
        </Card>
      ) : null}
      {!isAutexaApiConfigured() ? (
        <Card style={styles.card}>
          <Text style={styles.muted}>Configure EXPO_PUBLIC_AUTEXA_API_URL to manage payment links.</Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.label}>Label (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Garage rent"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
          <Text style={styles.label}>Fixed amount UGX (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Leave empty — payer chooses amount"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={suggested}
            onChangeText={setSuggested}
          />
          <PrimaryButton title="Create link" onPress={() => void onCreate()} loading={busy} />
        </Card>
      )}

      <Text style={styles.section}>Your links</Text>
      {loading ? <Text style={styles.muted}>Loading…</Text> : null}
      {!loading && rows.length === 0 ? <Text style={styles.muted}>No links yet.</Text> : null}
      {rows.map((r) => (
        <Card key={r.id} style={styles.rowCard}>
          <Text style={styles.rowTitle}>{r.title || 'Payment link'}</Text>
          <Text style={styles.url} selectable>
            {payUrl(r.slug)}
          </Text>
          {r.suggested_amount_ugx != null ? (
            <Text style={styles.muted}>
              Fixed: {Math.round(Number(r.suggested_amount_ugx)).toLocaleString()} UGX
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable style={styles.iconBtn} onPress={() => void copyUrl(r.slug)}>
              <Ionicons name="copy-outline" size={22} color={colors.primary} />
              <Text style={styles.iconBtnLabel}>Copy</Text>
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => void Share.share({ message: `Pay me on Autexa: ${payUrl(r.slug)}` })}
            >
              <Ionicons name="share-outline" size={22} color={colors.primary} />
              <Text style={styles.iconBtnLabel}>Share</Text>
            </Pressable>
            {r.active ? (
              <Pressable style={styles.iconBtn} onPress={() => void deactivate(r.id)}>
                <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                <Text style={[styles.iconBtnLabel, { color: colors.danger }]}>Deactivate</Text>
              </Pressable>
            ) : (
              <Text style={styles.inactive}>Inactive</Text>
            )}
          </View>
        </Card>
      ))}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  card: { marginBottom: spacing.md },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  muted: { fontSize: 14, color: colors.textMuted },
  warn: { fontSize: 14, color: colors.text, lineHeight: 20 },
  rowCard: { marginBottom: spacing.md },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  url: { fontSize: 12, color: colors.primary, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, alignItems: 'center' },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtnLabel: { fontSize: 14, fontWeight: '600', color: colors.primary },
  inactive: { fontSize: 14, color: colors.textMuted },
});
