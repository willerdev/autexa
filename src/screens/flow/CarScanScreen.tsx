import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMyCar } from '../../api/cars';
import { postAnalyzeCarScan } from '../../api/aiMarketplace';
import { Card, PrimaryButton, ScanningOverlay, ScreenScroll } from '../../components';
import { getErrorMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'CarScan'>;

export function CarScanScreen({ navigation, route }: Props) {
  const { carId, mode } = route.params;
  const [loading, setLoading] = useState(false);
  const [scanUri, setScanUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [car, setCar] = useState<{ make: string; model: string; year: string; plate: string } | null>(null);
  const [result, setResult] = useState<null | {
    summary: string;
    issues: { label: string; severity: 'low' | 'medium' | 'high'; notes: string }[];
    suggestions: { serviceKeyword: string; reason: string; urgency: 'normal' | 'soon' | 'urgent' }[];
  }>(null);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await getMyCar(carId);
        if (error) {
          Alert.alert('Car', getErrorMessage(error));
          return;
        }
        if (data) setCar({ make: data.make, model: data.model, year: data.year ?? '', plate: data.plate ?? '' });
      } finally {
        setLoading(false);
      }
    })();
  }, [carId]);

  const title = useMemo(() => {
    if (mode === 'cluster') return 'Scan dashboard';
    if (mode === 'interior') return 'Scan interior';
    return 'Scan exterior';
  }, [mode]);

  const instructions = useMemo(() => {
    if (mode === 'cluster') return 'Take a clear photo of the instrument cluster (warning lights, messages).';
    if (mode === 'interior') return 'Take a photo of the interior area you want help with (seats, AC controls, etc.).';
    return 'Take a photo of the exterior. Autexa can suggest services like wash, detailing, or repairs.';
  }, [mode]);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is required.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    const asset = r.assets[0];

    setLoading(true);
    setScanUri(asset.uri);
    setScanning(true);
    try {
      const form = new FormData();
      form.append('image', {
        uri: asset.uri,
        name: 'scan.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any);
      form.append('mode', mode);
      if (car) {
        form.append('make', car.make);
        form.append('model', car.model);
        form.append('year', car.year);
        form.append('plate', car.plate);
      }
      const out = await postAnalyzeCarScan(form);
      setResult(out.result);
    } catch (e) {
      Alert.alert('Scan failed', getErrorMessage(e));
    } finally {
      setScanning(false);
      setLoading(false);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>{title}</Text>
      <Card style={styles.card}>
        <Text style={styles.sub}>{instructions}</Text>
        {car ? (
          <Text style={styles.carLine}>
            {car.year ? `${car.year} ` : ''}
            {car.make} {car.model}
            {car.plate ? ` · ${car.plate}` : ''}
          </Text>
        ) : null}
        <PrimaryButton title={loading ? 'Working…' : 'Take a photo'} onPress={() => void takePhoto()} disabled={loading} style={styles.btn} />
      </Card>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {result ? (
        <>
          <Card style={styles.card}>
            <Text style={styles.section}>Summary</Text>
            <Text style={styles.sub}>{result.summary}</Text>
          </Card>

          {result.issues?.length ? (
            <Card style={styles.card}>
              <Text style={styles.section}>Possible issues</Text>
              {result.issues.map((i, idx) => (
                <View key={`${i.label}-${idx}`} style={styles.issueRow}>
                  <View style={styles.issueLeft}>
                    <Text style={styles.issueTitle}>{i.label}</Text>
                    <Text style={styles.issueNote}>{i.notes}</Text>
                  </View>
                  <View style={[styles.sevPill, i.severity === 'high' ? styles.sevHigh : i.severity === 'medium' ? styles.sevMed : styles.sevLow]}>
                    <Text style={styles.sevText}>{i.severity}</Text>
                  </View>
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={styles.card}>
            <Text style={styles.section}>Suggested services</Text>
            {(result.suggestions ?? []).map((s, idx) => (
              <Pressable
                key={`${s.serviceKeyword}-${idx}`}
                style={styles.suggRow}
                onPress={() => navigation.navigate('SelectService', { query: s.serviceKeyword })}
              >
                <View style={styles.issueLeft}>
                  <Text style={styles.issueTitle}>{s.serviceKeyword}</Text>
                  <Text style={styles.issueNote}>{s.reason}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
            <PrimaryButton
              title="Ask Autexa about this"
              variant="outline"
              onPress={() =>
                navigation.navigate('AiAssistant', {
                  seed: `I scanned my car ${mode}. Here are the suggestions: ${(result.suggestions ?? []).map((x) => x.serviceKeyword).join(', ')}. Help me decide what to book.`,
                })
              }
              style={styles.askBtn}
            />
          </Card>
        </>
      ) : null}

      <ScanningOverlay
        visible={scanning}
        imageUri={scanUri}
        title="Scanning…"
        subtitle="Autexa is analyzing your photo for issues and service suggestions"
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
  card: {
    marginBottom: spacing.sm,
  },
  sub: {
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
  },
  carLine: {
    marginTop: spacing.sm,
    color: colors.text,
    fontWeight: '800',
  },
  btn: {
    marginTop: spacing.md,
  },
  loading: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  section: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  issueLeft: {
    flex: 1,
  },
  issueTitle: {
    fontWeight: '900',
    color: colors.text,
  },
  issueNote: {
    marginTop: 6,
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 18,
  },
  sevPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  sevLow: { backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primary },
  sevMed: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' },
  sevHigh: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: colors.danger },
  sevText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: colors.text,
  },
  suggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  askBtn: {
    marginTop: spacing.sm,
  },
});

