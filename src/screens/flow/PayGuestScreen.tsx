import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AutexaApiError } from '../../api/autexaServer';
import {
  fetchGuestTopupStatus,
  fetchPublicPaymentLinkMeta,
  postPublicPaymentLinkTopup,
  type PublicPaymentLinkMeta,
} from '../../api/wallet';
import { isAutexaApiConfigured } from '../../config/env';
import { Card, PrimaryButton } from '../../components';
import { colors, radius, spacing } from '../../theme';

type Momo = 'auto';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function PayGuestScreen({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [meta, setMeta] = useState<PublicPaymentLinkMeta | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [provider] = useState<Momo>('auto');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pollId, setPollId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isAutexaApiConfigured() || !slug) {
      setLoadErr(isAutexaApiConfigured() ? 'Invalid link' : 'API not configured.');
      return;
    }
    void fetchPublicPaymentLinkMeta(slug).then((m) => {
      if (cancelled) return;
      if (!m) setLoadErr('This payment link is inactive or expired.');
      else {
        setMeta(m);
        const sug = m.suggested_amount_ugx != null ? Number(m.suggested_amount_ugx) : NaN;
        if (Number.isFinite(sug) && sug >= 1000) setAmount(String(Math.round(sug)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!pollId) return;
    let cancelled = false;
    const t = setInterval(() => {
      void fetchGuestTopupStatus(pollId).then(
        (s) => {
          if (cancelled) return;
          if (s.status === 'success') {
            setPollId(null);
            setMsg('Payment completed. Thank you.');
          } else if (s.status === 'failed') {
            setPollId(null);
            setMsg(s.reason ?? 'Payment failed.');
          } else if (s.status === 'expired') {
            setPollId(null);
            setMsg('This top-up session expired.');
          }
        },
        () => {},
      );
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pollId]);

  async function onSubmit() {
    setMsg('');
    const a = num(amount);
    if (!Number.isFinite(a)) {
      setMsg('Enter a valid amount.');
      return;
    }
    if (!phone.trim()) {
      setMsg('Enter the mobile money number that will pay.');
      return;
    }
    try {
      setBusy(true);
      const res = await postPublicPaymentLinkTopup(slug, { amount: a, phone: phone.trim(), provider });
      setMsg(res.message);
      setPollId(res.topupRequestId);
    } catch (e) {
      setMsg(e instanceof AutexaApiError ? e.message : 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  }

  const sug = meta?.suggested_amount_ugx != null ? Number(meta.suggested_amount_ugx) : NaN;
  const fixedAmount = Number.isFinite(sug) && sug >= 1000;

  return (
    <View style={styles.wrap}>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image source={require('../../../assets/images/icon.png')} style={styles.brandIcon} />
          <Text style={styles.brand}>Gearup</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Send mobile money</Text>
        <Text style={styles.sub}>
          Funds go to the Gearup user who shared this link. You do not need a Gearup account.
        </Text>
        {loadErr ? <Text style={styles.err}>{loadErr}</Text> : null}
        {meta ? (
          <Card>
            {meta.title ? <Text style={styles.cardTitle}>{meta.title}</Text> : null}
            {fixedAmount ? (
              <Text style={styles.bigAmt}>{Math.round(sug).toLocaleString()} UGX</Text>
            ) : meta.suggested_amount_ugx != null ? (
              <Text style={styles.sub}>
                Suggested: {Math.round(Number(meta.suggested_amount_ugx)).toLocaleString()} UGX
              </Text>
            ) : null}
            <Text style={styles.sub}>Mobile money: MTN / Airtel (auto-detected)</Text>
            {!fixedAmount ? (
              <TextInput
                style={styles.input}
                placeholder="Amount (UGX)"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={amount}
                onChangeText={setAmount}
              />
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Phone (256…)"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {msg ? (
              <Text style={[styles.feedback, msg.includes('completed') ? styles.ok : styles.err]}>{msg}</Text>
            ) : null}
            <PrimaryButton title="Pay with mobile money" onPress={() => void onSubmit()} loading={busy} />
            {pollId ? (
              <View style={styles.pollRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.pollText}>Waiting for confirmation…</Text>
              </View>
            ) : null}
          </Card>
        ) : loadErr ? null : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandIcon: { width: 28, height: 28, borderRadius: 7 },
  brand: { fontSize: 18, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  bigAmt: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
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
  err: { color: colors.danger, marginBottom: spacing.sm, fontWeight: '600' },
  ok: { color: '#15803d', marginBottom: spacing.sm, fontWeight: '600' },
  feedback: { marginBottom: spacing.sm, fontSize: 14 },
  pollRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  pollText: { flex: 1, fontSize: 14, color: colors.textSecondary },
});
