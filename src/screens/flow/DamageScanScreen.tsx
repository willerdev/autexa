import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { postAnalyzeDamage } from '../../api/aiMarketplace';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import { isAutexaApiConfigured } from '../../config/env';
import { getErrorMessage } from '../../lib/errors';
import { colors, spacing } from '../../theme';

export function DamageScanScreen() {
  const navigation = useNavigation();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Photo library access is needed.');
      return;
    }
    const img = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!img.canceled && img.assets[0]?.uri) {
      setUri(img.assets[0].uri);
      setResult(null);
    }
  };

  const analyze = async () => {
    if (!uri) {
      Alert.alert('Photo', 'Choose an image first.');
      return;
    }
    if (!isAutexaApiConfigured()) {
      Alert.alert('API', 'Configure EXPO_PUBLIC_AUTEXA_API_URL and start the server.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('image', {
        uri,
        name: 'damage.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);
      const { analysis } = await postAnalyzeDamage(form);
      const lines = [
        `Issue: ${analysis.issue}`,
        `Severity: ${analysis.severity}`,
        `Estimate: $${analysis.estimatedRepairUsdMin} – $${analysis.estimatedRepairUsdMax}`,
        analysis.notes,
      ];
      setResult(lines.join('\n'));
    } catch (e) {
      Alert.alert('Analysis failed', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>Damage check</Text>
      <Text style={styles.sub}>
        Upload a clear photo of exterior damage. Estimates are approximate and not a quote.
      </Text>
      <PrimaryButton title="Choose photo" onPress={() => void pick()} style={styles.btn} />
      {uri ? <Image source={{ uri }} style={styles.preview} resizeMode="cover" /> : null}
      <PrimaryButton
        title={loading ? 'Analyzing…' : 'Analyze with AI'}
        onPress={() => void analyze()}
        disabled={loading || !uri}
        loading={loading}
      />
      {result ? (
        <Card style={styles.out}>
          <Text style={styles.outText}>{result}</Text>
        </Card>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  back: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  sub: {
    marginTop: spacing.sm,
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  btn: {
    marginBottom: spacing.md,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: spacing.md,
    backgroundColor: colors.border,
  },
  out: {
    marginTop: spacing.lg,
  },
  outText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
});
