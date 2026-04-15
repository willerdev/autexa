import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, TextField } from '../../components';
import { startTwofaLoginChallenge, verifyTwofaLoginChallenge } from '../../api/twofa';
import { colors, radius, spacing } from '../../theme';

type Props = {
  onVerified: () => void;
};

export function TwoFactorGateScreen({ onVerified }: Props) {
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = async () => {
    setSending(true);
    try {
      const r = await startTwofaLoginChallenge();
      if (r.skipped) {
        onVerified();
        return;
      }
      if (!r.challengeId) throw new Error('OTP was not created.');
      if (mounted.current) setChallengeId(r.challengeId);
      Alert.alert('OTP sent', 'Check your SMS for the 6-digit code.');
    } catch (e) {
      Alert.alert('2FA', e instanceof Error ? e.message : 'Could not send OTP');
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  const verify = async () => {
    if (!challengeId) {
      await send();
      return;
    }
    const c = code.trim();
    if (!/^[0-9]{6}$/.test(c)) {
      Alert.alert('2FA', 'Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    try {
      const r = await verifyTwofaLoginChallenge({ challengeId, code: c });
      if (!r.ok) throw new Error('Invalid code');
      // Cache verification for 12 hours on this device.
      const until = Date.now() + 12 * 60 * 60 * 1000;
      await AsyncStorage.setItem('autexa:twofa_verified_until', String(until));
      onVerified();
    } catch (e) {
      Alert.alert('2FA', e instanceof Error ? e.message : 'Could not verify');
    } finally {
      if (mounted.current) setVerifying(false);
    }
  };

  useEffect(() => {
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Two‑factor authentication</Text>
        <Text style={styles.sub}>Enter the 6‑digit code we sent to your phone.</Text>
        <TextField
          label="OTP code"
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
          keyboardType="number-pad"
        />
        <PrimaryButton title="Verify" onPress={() => void verify()} loading={verifying} disabled={verifying} />
        <PrimaryButton
          title="Resend code"
          variant="outline"
          onPress={() => void send()}
          loading={sending}
          disabled={sending}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.overlay,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  sub: { marginTop: 6, marginBottom: spacing.md, color: colors.textSecondary, lineHeight: 18 },
});

