import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { confirmTwofaEnable, fetchTwofaStatus, startTwofaEnable } from '../../api/twofa';
import { navigateToAppStack } from '../../navigation/navigateFromRoot';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function TwoFactorSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const st = await fetchTwofaStatus();
      setTwofaEnabled(Boolean(st.twofaEnabled));
      setPhone(st.phone);
    } catch {
      setTwofaEnabled(false);
      setPhone(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const start = async () => {
    try {
      setBusy(true);
      const r = await startTwofaEnable();
      if (r.alreadyEnabled) {
        await refresh();
        return;
      }
      if (!r.challengeId) throw new Error('OTP was not created.');
      setChallengeId(r.challengeId);
      Alert.alert('OTP sent', 'Check your phone for the 6-digit code.');
    } catch (e) {
      Alert.alert('2FA', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const cid = challengeId;
    if (!cid) {
      await start();
      return;
    }
    const c = code.trim();
    if (!/^[0-9]{6}$/.test(c)) {
      Alert.alert('2FA', 'Enter the 6-digit code.');
      return;
    }
    try {
      setBusy(true);
      await confirmTwofaEnable({ challengeId: cid, code: c });
      setChallengeId(null);
      setCode('');
      await refresh();
      Alert.alert('2FA', 'Two-factor authentication is enabled.');
    } catch (e) {
      Alert.alert('2FA', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Card style={styles.card}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{loading ? 'Loading…' : twofaEnabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.hint}>
          {phone ? `OTP will be sent to: ${phone}` : 'Add a phone number to your profile to enable SMS OTP.'}
        </Text>
      </Card>

      {!twofaEnabled ? (
        <Card style={styles.card}>
          <Text style={styles.label}>Enable 2FA</Text>
          {challengeId ? (
            <>
              <TextField
                label="OTP code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
              />
              <PrimaryButton title="Confirm" onPress={() => void confirm()} loading={busy} disabled={busy} />
              <PrimaryButton
                title="Resend code"
                variant="outline"
                onPress={() => void start()}
                loading={busy}
                disabled={busy}
                style={{ marginTop: spacing.sm }}
              />
            </>
          ) : (
            <>
              <PrimaryButton title="Send OTP" onPress={() => void start()} loading={busy} disabled={busy || !phone} />
              {!phone ? (
                <PrimaryButton
                  title="Add phone number"
                  variant="outline"
                  onPress={() => navigateToAppStack('EditProfile', undefined)}
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.label}>Note</Text>
          <Text style={styles.hint}>Disabling 2FA is not implemented yet.</Text>
        </Card>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  label: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  value: { marginTop: 6, fontSize: 18, fontWeight: '900', color: colors.text },
  hint: { marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});

