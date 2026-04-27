import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { supabase } from '../../lib/supabase';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';
import { useSessionStore } from '../../stores/sessionStore';

export function ProviderAddBusinessScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const profile = useSessionStore((s) => s.profile);
  const isAdmin = (profile?.role ?? 'user') === 'admin';
  const [name, setName] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [workingDays, setWorkingDays] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isAdmin) return;
    const nm = name.trim();
    const st = serviceType.trim();
    if (!nm || !st) {
      Alert.alert('Add business', 'Enter business name and service type.');
      return;
    }
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) {
      Alert.alert('Add business', 'Not signed in.');
      return;
    }
    const latNum = lat.trim() ? Number(lat.trim()) : null;
    const lngNum = lng.trim() ? Number(lng.trim()) : null;
    if ((latNum != null && !Number.isFinite(latNum)) || (lngNum != null && !Number.isFinite(lngNum))) {
      Alert.alert('Add business', 'Latitude/longitude must be valid numbers.');
      return;
    }
    try {
      setBusy(true);
      const { error } = await supabase.from('providers').insert({
        name: nm,
        service_type: st,
        rating: 4.5,
        location: location.trim(),
        is_available: true,
        user_id: null,
        claim_status: 'unclaimed',
        created_by_user_id: uid,
        phone: phone.trim(),
        working_days: workingDays.trim(),
        lat: latNum,
        lng: lngNum,
      });
      if (error) throw new Error(error.message);
      Alert.alert('Added', 'Business listing added (unclaimed).');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Add business failed', getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
        <Card>
          <Text style={styles.deniedTitle}>Admin only</Text>
          <Text style={styles.deniedSub}>Adding provider listings from this screen is only available to admin accounts.</Text>
        </Card>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>Add business</Text>
      <Text style={styles.sub}>Create an unclaimed public listing (no owner). Make sure details are accurate.</Text>

      <Card style={styles.card}>
        <TextField label="Business name" value={name} onChangeText={setName} />
        <TextField label="Service type" value={serviceType} onChangeText={setServiceType} />
        <TextField label="Location" value={location} onChangeText={setLocation} />
        <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <TextField label="Working days (optional)" value={workingDays} onChangeText={setWorkingDays} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="Latitude (optional)" value={lat} onChangeText={setLat} keyboardType="numeric" />
          </View>
          <View style={styles.flex}>
            <TextField label="Longitude (optional)" value={lng} onChangeText={setLng} keyboardType="numeric" />
          </View>
        </View>
      </Card>

      <PrimaryButton title="Add listing" onPress={() => void submit()} loading={busy} disabled={busy} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  deniedTitle: { fontWeight: '900', color: colors.text, fontSize: 16, marginBottom: 6 },
  deniedSub: { color: colors.textMuted, fontWeight: '600', lineHeight: 20 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm },
  sub: { color: colors.textSecondary, lineHeight: 18, marginBottom: spacing.md },
  card: { padding: spacing.md, gap: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

