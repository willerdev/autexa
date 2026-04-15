import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { updateProfile } from '../../api/profile';
import { useAuth } from '../../context/AuthContext';
import { useSessionStore } from '../../stores/sessionStore';
import { colors, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function EditProfileScreen() {
  const { refreshProfile } = useAuth();
  const profile = useSessionStore((s) => s.profile);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [busy, setBusy] = useState(false);

  const canSave = useMemo(() => {
    const nm = name.trim();
    const ph = phone.trim();
    if (!profile?.id) return false;
    if (!nm) return false;
    // phone optional, but if present require at least 9 digits
    if (ph && ph.replace(/[^0-9]/g, '').length < 9) return false;
    return true;
  }, [name, phone, profile?.id]);

  const save = async () => {
    if (!profile?.id) {
      Alert.alert('Profile', 'Not signed in.');
      return;
    }
    try {
      setBusy(true);
      const patch = { name: name.trim(), phone: phone.trim() || null };
      const { error } = await updateProfile(profile.id, patch);
      if (error) throw error;
      await refreshProfile();
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e) {
      Alert.alert('Save failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Card style={styles.card}>
        <TextField label="Name" value={name} onChangeText={setName} />
        <TextField label="Phone (for OTP)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <PrimaryButton title="Save" onPress={() => void save()} loading={busy} disabled={busy || !canSave} />
      </Card>
      <Text style={styles.hint}>
        Add your phone number to enable SMS OTP (2FA). Use a Uganda number (e.g. 07… or +256…).
      </Text>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  hint: { marginTop: spacing.sm, color: colors.textSecondary, lineHeight: 18 },
});

