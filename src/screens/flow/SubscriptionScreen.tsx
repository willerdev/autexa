import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { fetchSubscriptionStatus, startProfessionalUpgrade } from '../../api/subscriptions';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function SubscriptionScreen() {
  const [loading, setLoading] = useState(true);
  const [st, setSt] = useState<Awaited<ReturnType<typeof fetchSubscriptionStatus>> | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const s = await fetchSubscriptionStatus();
      setSt(s);
    } catch (e) {
      setSt(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const upgrade = async () => {
    const p = phone.trim();
    if (!p) {
      Alert.alert('Upgrade', 'Enter your mobile money phone number.');
      return;
    }
    try {
      setBusy(true);
      const r = await startProfessionalUpgrade({ phone: p, provider: 'auto' });
      Alert.alert('Subscription', r.message);
      await refresh();
    } catch (e) {
      Alert.alert('Upgrade failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const plan = st?.plan ?? 'free';
  const aiUsed = st?.aiUsed ?? 0;
  const aiLimit = st?.aiLimit ?? 20;
  const remaining = Math.max(0, aiLimit - aiUsed);

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Card style={styles.card}>
        <Text style={styles.label}>Plan</Text>
        <Text style={styles.value}>{loading ? 'Loading…' : plan}</Text>
        <Text style={styles.hint}>
          {plan === 'free'
            ? `AI requests: ${aiUsed}/${aiLimit} (remaining ${remaining}). SMS sending is disabled.`
            : 'Professional: SMS sending enabled.'}
        </Text>
      </Card>

      {plan !== 'professional' ? (
        <Card style={styles.card}>
          <Text style={styles.label}>Upgrade to Professional</Text>
          <Text style={styles.hint}>Professional unlocks unlimited AI requests and SMS sending.</Text>
          <View style={{ marginTop: spacing.sm }}>
            <TextField label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>
          <PrimaryButton title="Start upgrade" onPress={() => void upgrade()} loading={busy} disabled={busy} />
        </Card>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, borderRadius: radius.lg },
  label: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.text },
  hint: { marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});

