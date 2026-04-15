import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { uploadProviderListingImageFromBase64 } from '../../api/serviceImages';
import { supabase } from '../../lib/supabase';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

type Step = 1 | 2 | 3;

export function AddUnclaimedBusinessWizard() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'creating' | 'uploading' | 'saving'>('idle');
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [dotTick, setDotTick] = useState(0);
  const dotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 1 (required basics)
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [bizKind, setBizKind] = useState<'service' | 'product'>('service');

  // Optional extras (review step)
  const [workingDays, setWorkingDays] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  // Step 2 photos
  const [photos, setPhotos] = useState<Array<{ uri: string; base64: string }>>([]);

  const canNextStep1 = useMemo(() => {
    return Boolean(name.trim() && phone.trim() && location.trim() && serviceType.trim());
  }, [name, phone, location, serviceType]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Photos', 'Allow photo library access to add business photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 6,
      base64: true,
    });
    if (res.canceled) return;
    const picked = res.assets
      .filter((a) => Boolean(a.uri) && Boolean(a.base64))
      .map((a) => ({ uri: a.uri, base64: String(a.base64) }));
    setPhotos((prev) => {
      const next = [...prev, ...picked];
      const byUri = new Map<string, { uri: string; base64: string }>();
      for (const p of next) byUri.set(p.uri, p);
      return Array.from(byUri.values()).slice(0, 6);
    });
  };

  const removePhoto = (uri: string) => setPhotos((prev) => prev.filter((x) => x.uri !== uri));

  const submit = async () => {
    const nm = name.trim();
    const ph = phone.trim();
    const loc = location.trim();
    const st = serviceType.trim();
    if (!nm || !ph || !loc || !st) {
      Alert.alert('Add business', 'Fill in name, phone, location, and service type.');
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
      setUploadPhase('creating');
      setUploadProgress({ done: 0, total: photos.length });

      // 1) Insert listing (unclaimed)
      const { data: inserted, error: insErr } = await supabase
        .from('providers')
        .insert({
          name: nm,
          service_type: st,
          rating: 4.5,
          location: loc,
          is_available: true,
          user_id: null,
          claim_status: 'unclaimed',
          created_by_user_id: uid,
          phone: ph,
          working_days: workingDays.trim(),
          lat: latNum,
          lng: lngNum,
          is_product_business: bizKind === 'product',
        })
        .select('id')
        .single();
      if (insErr) throw new Error(insErr.message);
      const providerId = inserted?.id;
      if (!providerId) throw new Error('Could not create listing.');

      // 2) Upload photos (best-effort) and patch provider row.
      // If storage/network is unavailable, keep the listing and let the user add photos later.
      let photoWarning: string | null = null;
      if (photos.length) {
        setUploadPhase('uploading');
        const urls: string[] = [];
        for (const p of photos) {
          try {
            // Use the unrestricted test bucket first to validate the client pipeline.
            const { url, error } = await uploadProviderListingImageFromBase64({
              providerId,
              base64: p.base64,
              sourceUri: p.uri,
              bucket: 'pictures',
            });
            if (error) throw error;
            if (url) urls.push(url);
            setUploadProgress((prev) => ({ ...prev, done: Math.min(prev.total, prev.done + 1) }));
          } catch (e) {
            photoWarning = e instanceof Error ? e.message : 'Could not upload one or more photos.';
            break;
          }
        }
        if (urls.length) {
          setUploadPhase('saving');
          const imageUrl = urls[0] || null;
          const { error: upErr } = await supabase
            .from('providers')
            .update({ image_url: imageUrl, gallery_urls: urls })
            .eq('id', providerId);
          if (upErr) {
            photoWarning = upErr.message;
          }
        }
      }

      setUploadPhase('idle');
      Alert.alert('Posted', photoWarning ? `Business listing created. Photos were not saved: ${photoWarning}` : 'Business listing created.');
      navigation.goBack();
    } catch (e) {
      setUploadPhase('idle');
      const msg = getErrorMessage(e);
      const hint =
        /network request failed/i.test(msg)
          ? '\n\nCheck your internet and confirm this build has valid Supabase settings (EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY), then try again.'
          : '';
      Alert.alert('Add business failed', `${msg}${hint}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (uploadPhase === 'idle') {
      if (dotTimerRef.current) clearInterval(dotTimerRef.current);
      dotTimerRef.current = null;
      setDotTick(0);
      return;
    }
    if (dotTimerRef.current) clearInterval(dotTimerRef.current);
    dotTimerRef.current = setInterval(() => setDotTick((t) => (t + 1) % 4), 320);
    return () => {
      if (dotTimerRef.current) clearInterval(dotTimerRef.current);
      dotTimerRef.current = null;
    };
  }, [uploadPhase]);

  const dots = '.'.repeat(dotTick);

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>Add business</Text>
      <Text style={styles.sub}>Step {step} of 3</Text>

      {uploadPhase !== 'idle' ? (
        <View style={styles.overlay} pointerEvents="auto">
          <View style={styles.overlayCard}>
            <ActivityIndicator />
            <Text style={styles.overlayTitle}>
              {uploadPhase === 'creating'
                ? `Creating listing${dots}`
                : uploadPhase === 'uploading'
                  ? `Uploading photos ${uploadProgress.done}/${uploadProgress.total}${dots}`
                  : `Saving photos${dots}`}
            </Text>
            <Text style={styles.overlayHint}>Please wait — this can take a few seconds.</Text>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <Card style={styles.card}>
          <TextField label="Business name" value={name} onChangeText={setName} />
          <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextField label="Location" value={location} onChangeText={setLocation} />
          <TextField label="Type of business (service type)" value={serviceType} onChangeText={setServiceType} />

          <View style={styles.kindRow}>
            <Pressable
              onPress={() => setBizKind('service')}
              style={[styles.kindPill, bizKind === 'service' ? styles.kindOn : styles.kindOff]}
            >
              <Text style={[styles.kindText, bizKind === 'service' ? styles.kindTextOn : styles.kindTextOff]}>
                Services based
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setBizKind('product')}
              style={[styles.kindPill, bizKind === 'product' ? styles.kindOn : styles.kindOff]}
            >
              <Text style={[styles.kindText, bizKind === 'product' ? styles.kindTextOn : styles.kindTextOff]}>
                Product based
              </Text>
            </Pressable>
          </View>

          <PrimaryButton
            title="Next"
            onPress={() => setStep(2)}
            disabled={!canNextStep1}
          />
        </Card>
      ) : null}

      {step === 2 ? (
        <>
          <Card style={styles.card}>
            <Text style={styles.blockTitle}>Business photos</Text>
            <Text style={styles.hint}>Add up to 6 photos (optional but recommended).</Text>
            <PrimaryButton title="Pick photos" onPress={() => void pickPhotos()} />
            {photos.length ? (
              <View style={styles.photoGrid}>
                {photos.map((p) => (
                  <Pressable key={p.uri} onPress={() => removePhoto(p.uri)} style={styles.photoCell}>
                    <Image source={{ uri: p.uri }} style={styles.photo} />
                    <View style={styles.photoX}>
                      <Text style={styles.photoXText}>×</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>

          <View style={styles.footerRow}>
            <PrimaryButton title="Back" variant="outline" onPress={() => setStep(1)} style={styles.footerBtn} />
            <PrimaryButton title="Next" onPress={() => setStep(3)} style={styles.footerBtn} />
          </View>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card style={styles.card}>
            <Text style={styles.blockTitle}>Review & post</Text>
            <Text style={styles.reviewLine}>Name: {name.trim() || '—'}</Text>
            <Text style={styles.reviewLine}>Phone: {phone.trim() || '—'}</Text>
            <Text style={styles.reviewLine}>Location: {location.trim() || '—'}</Text>
            <Text style={styles.reviewLine}>Service type: {serviceType.trim() || '—'}</Text>
            <Text style={styles.reviewLine}>Business kind: {bizKind === 'product' ? 'Product based' : 'Services based'}</Text>
            <Text style={[styles.blockTitle, { marginTop: spacing.md }]}>More details (optional)</Text>
            <TextField label="Working days" value={workingDays} onChangeText={setWorkingDays} />
            <View style={styles.latLngRow}>
              <View style={styles.flex}>
                <TextField label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" />
              </View>
              <View style={styles.flex}>
                <TextField label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" />
              </View>
            </View>
          </Card>

          <View style={styles.footerRow}>
            <PrimaryButton title="Back" variant="outline" onPress={() => setStep(2)} style={styles.footerBtn} />
            <PrimaryButton title="Post" onPress={() => void submit()} loading={busy} disabled={busy} style={styles.footerBtn} />
          </View>
        </>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: spacing.sm, marginBottom: 4 },
  sub: { color: colors.textSecondary, marginBottom: spacing.md },
  card: { padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md, gap: spacing.md },
  blockTitle: { fontSize: 14, fontWeight: '900', color: colors.text },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  kindPill: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  kindOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  kindOff: { backgroundColor: colors.surface, borderColor: colors.border },
  kindText: { fontSize: 12, fontWeight: '900' },
  kindTextOn: { color: colors.primaryDark },
  kindTextOff: { color: colors.textSecondary },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  photoCell: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoX: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  photoXText: { color: '#fff', fontWeight: '900', fontSize: 16, marginTop: -2 },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  footerBtn: { flex: 1 },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 50,
  },
  overlayCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  overlayTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  overlayHint: { fontSize: 12, color: colors.textSecondary, lineHeight: 16 },
  reviewLine: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  latLngRow: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});

