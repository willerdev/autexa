import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getMyCar, upsertMyCar } from '../../api/cars';
import { postRecognizeCar } from '../../api/aiMarketplace';
import { Card, PrimaryButton, ScanningOverlay, ScreenScroll, TextField } from '../../components';
import { getErrorMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'AddCar'>;

export function AddCarScreen({ navigation, route }: Props) {
  const carId = route.params?.carId;
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [loading, setLoading] = useState(false);
  const [scanUri, setScanUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState({ make: '', model: '', year: '', plate: '' });
  const canSave = Boolean(draft.make.trim() && draft.model.trim());

  useEffect(() => {
    if (!carId) return;
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await getMyCar(carId);
        if (error) {
          Alert.alert('Car', getErrorMessage(error));
          return;
        }
        if (data) {
          setDraft({ make: data.make, model: data.model, year: data.year ?? '', plate: data.plate ?? '' });
          setStep('form');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [carId]);

  const title = useMemo(() => (carId ? 'Edit car' : 'Add car'), [carId]);

  const startManual = () => setStep('form');

  const startPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is required to scan the car.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
    });
    if (r.canceled || !r.assets?.[0]?.uri) return;

    setScanUri(r.assets[0].uri);
    setLoading(true);
    setScanning(true);
    try {
      const asset = r.assets[0];
      const form = new FormData();
      form.append('image', {
        uri: asset.uri,
        name: 'car.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any);
      const out = await postRecognizeCar(form);
      setDraft({
        make: out.car?.make ?? '',
        model: out.car?.model ?? '',
        year: out.car?.year ?? '',
        plate: out.car?.plate ?? '',
      });
      setStep('form');
    } catch (e) {
      Alert.alert('Scan failed', getErrorMessage(e));
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  const save = async () => {
    if (!canSave) {
      Alert.alert('Missing info', 'Please enter make and model.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await upsertMyCar({
        id: carId,
        make: draft.make,
        model: draft.model,
        year: draft.year,
        plate: draft.plate,
      });
      if (error) {
        Alert.alert('Save failed', getErrorMessage(error));
        return;
      }
      const id = data?.id ?? carId;
      if (id) {
        Alert.alert('Saved', 'Now scan your dashboard/interior to get service suggestions.', [
          { text: 'Later', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Scan dashboard', onPress: () => navigation.navigate('CarScan', { carId: id, mode: 'cluster' }) },
        ]);
      } else {
        navigation.goBack();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>{title}</Text>

      {step === 'choose' ? (
        <Card>
          <Text style={styles.pickTitle}>How do you want to add your car?</Text>
          <Text style={styles.pickSub}>You can fill in details manually, or take a photo and let Gearup detect them.</Text>
          <View style={styles.pickRow}>
            <Pressable onPress={startManual} style={styles.pickTile}>
              <Text style={styles.pickTileTitle}>Fill details</Text>
              <Text style={styles.pickTileSub}>Quick manual entry</Text>
            </Pressable>
            <Pressable onPress={() => void startPhoto()} style={styles.pickTile}>
              <Text style={styles.pickTileTitle}>Take a photo</Text>
              <Text style={styles.pickTileSub}>AI recognizes details</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <>
          <View style={styles.form}>
            <TextField label="Make" value={draft.make} onChangeText={(t) => setDraft((d) => ({ ...d, make: t }))} />
            <TextField label="Model" value={draft.model} onChangeText={(t) => setDraft((d) => ({ ...d, model: t }))} />
            <TextField label="Year" value={draft.year} onChangeText={(t) => setDraft((d) => ({ ...d, year: t }))} />
            <TextField
              label="License plate"
              value={draft.plate}
              onChangeText={(t) => setDraft((d) => ({ ...d, plate: t }))}
              autoCapitalize="characters"
            />
          </View>

          <PrimaryButton title={loading ? 'Saving…' : 'Save car'} onPress={() => void save()} disabled={loading} />
          <PrimaryButton
            title="Scan details again"
            variant="outline"
            onPress={() => void startPhoto()}
            disabled={loading}
            style={styles.secondary}
          />
        </>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      <ScanningOverlay
        visible={scanning}
        imageUri={scanUri}
        title="Scanning your car…"
        subtitle="Gearup is recognizing make, model, year, and plate"
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
  },
  pickTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  pickSub: {
    marginTop: 6,
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
  },
  pickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pickTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  pickTileTitle: {
    fontWeight: '900',
    color: colors.text,
    marginBottom: 4,
  },
  pickTileSub: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  form: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  secondary: {
    marginTop: spacing.sm,
  },
  loading: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});

