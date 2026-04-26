import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ensureProviderProfile,
  getMyProviderProfile,
  listMyProviderCategories,
  listMyProviderServices,
  upsertProviderService,
  deleteProviderService,
} from '../../api/providerDashboard';
import { listServiceTypeSchemas, type ServiceTypeSchemaRow } from '../../api/serviceCatalog';
import { postDescribeServiceImage } from '../../api/aiMarketplace';
import { Card, PrimaryButton, ScanningOverlay, ScreenScroll, TextField } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<AppStackParamList, 'ProviderServiceEdit'>;

export function ProviderServiceEditScreen({ navigation, route }: Props) {
  const serviceId = route.params?.serviceId;
  const [providerId, setProviderId] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeSchemaRow[]>([]);
  const [serviceType, setServiceType] = useState('general');
  const [tagsStr, setTagsStr] = useState('');
  const [galleryUrlsStr, setGalleryUrlsStr] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [metadataExtraJson, setMetadataExtraJson] = useState('{}');

  const activeSchema = useMemo(
    () => serviceTypes.find((t) => t.service_type === serviceType),
    [serviceTypes, serviceType],
  );
  const schemaFields = useMemo(
    () =>
      (Array.isArray(activeSchema?.metadata_schema?.fields)
        ? (activeSchema!.metadata_schema!.fields as { key: string; label?: string; type?: string }[])
        : []) ?? [],
    [activeSchema],
  );

  const canSave = useMemo(() => Boolean(title.trim()), [title]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setBusy(true);
      try {
        await ensureProviderProfile();
        const { data: p } = await getMyProviderProfile();
        if (!p?.id) return;
        if (!alive) return;
        setProviderId(p.id);

        const cats = await listMyProviderCategories(p.id);
        if (!alive) return;
        setCategories((cats.data ?? []).map((c) => ({ id: c.id, name: c.name })));

        let loadedTypes: ServiceTypeSchemaRow[] = [];
        try {
          const { types } = await listServiceTypeSchemas();
          loadedTypes = types ?? [];
          if (alive) setServiceTypes(loadedTypes);
        } catch {
          if (alive) setServiceTypes([]);
        }

        if (serviceId) {
          const list = await listMyProviderServices(p.id);
          const found = (list.data ?? []).find((x) => x.id === serviceId);
          if (found) {
            setCategoryId(found.category_id ?? null);
            setTitle(found.title ?? '');
            setDescription(found.description ?? '');
            setPrice(String((found.price_cents ?? 0) / 100));
            setIsActive(Boolean(found.is_active));
            const st = (found.service_type ?? 'general').toLowerCase();
            setServiceType(st);
            setTagsStr((found.tags ?? []).join(', '));
            setGalleryUrlsStr((found.gallery_urls ?? []).filter(Boolean).join('\n'));
            const md = { ...((found.metadata ?? {}) as Record<string, unknown>) };
            const schema = loadedTypes.find((t) => t.service_type === st);
            const fields = Array.isArray(schema?.metadata_schema?.fields)
              ? (schema.metadata_schema.fields as { key: string; type?: string }[])
              : [];
            const fv: Record<string, string> = {};
            const extra = { ...md };
            for (const f of fields) {
              const v = md[f.key];
              delete extra[f.key];
              if (v === undefined || v === null) fv[f.key] = '';
              else if (typeof v === 'object') fv[f.key] = JSON.stringify(v);
              else fv[f.key] = String(v);
            }
            if (alive) {
              setFieldValues(fv);
              setMetadataExtraJson(Object.keys(extra).length ? JSON.stringify(extra, null, 2) : '{}');
            }
          }
        }
      } catch (e) {
        Alert.alert('Service', getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [serviceId]);

  const buildMetadataPayload = (): Record<string, unknown> => {
    let extra: Record<string, unknown> = {};
    try {
      extra = JSON.parse(metadataExtraJson.trim() || '{}') as Record<string, unknown>;
    } catch {
      extra = {};
    }
    const meta: Record<string, unknown> = { ...extra };
    for (const f of schemaFields) {
      const raw = (fieldValues[f.key] ?? '').trim();
      if (raw === '') continue;
      const t = (f.type ?? 'string').toLowerCase();
      if (t === 'number') {
        const n = Number(raw);
        if (!Number.isNaN(n)) meta[f.key] = n;
      } else if (t === 'boolean') {
        meta[f.key] = raw === 'true' || raw === 'yes' || raw === '1';
      } else if (t === 'array') {
        try {
          meta[f.key] = JSON.parse(raw);
        } catch {
          meta[f.key] = [];
        }
      } else {
        meta[f.key] = raw;
      }
    }
    return meta;
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera', 'Camera permission is required.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    setImageUri(r.assets[0].uri);
  };

  const aiDescribe = async () => {
    if (!imageUri) {
      Alert.alert('AI', 'Take a photo first.');
      return;
    }
    setScanning(true);
    try {
      const form = new FormData();
      form.append('image', { uri: imageUri, name: 'service.jpg', type: 'image/jpeg' } as any);
      const out = await postDescribeServiceImage(form);
      if (out?.suggestion?.title && !title.trim()) setTitle(out.suggestion.title);
      if (out?.suggestion?.description && !description.trim()) setDescription(out.suggestion.description);
    } catch (e) {
      Alert.alert('AI', getErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!providerId || !canSave) return;
    const cents = Math.max(0, Math.round(Number(price || '0') * 100));
    const tags = tagsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const metadata = buildMetadataPayload();
    const galleryUrls = galleryUrlsStr
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s));
    setBusy(true);
    try {
      const { error } = await upsertProviderService({
        id: serviceId,
        providerId,
        categoryId,
        title,
        description,
        priceCents: cents,
        isActive,
        serviceType,
        tags,
        metadata,
        galleryUrls: galleryUrls.length ? galleryUrls : [],
      });
      if (error) {
        Alert.alert('Save', getErrorMessage(error));
        return;
      }
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!serviceId) return;
    Alert.alert('Delete service', 'Remove this service?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const r = await deleteProviderService(serviceId);
              if (r.error) Alert.alert('Delete', getErrorMessage(r.error));
              navigation.goBack();
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <Text style={styles.title}>{serviceId ? 'Edit service' : 'New service'}</Text>

      <Card style={styles.card}>
        <Text style={styles.section}>Photo</Text>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <View style={styles.image} />}
        <View style={styles.photoRow}>
          <PrimaryButton title="Take photo" variant="outline" onPress={() => void pickImage()} disabled={busy} style={styles.photoBtn} />
          <PrimaryButton title="AI write description" onPress={() => void aiDescribe()} disabled={busy || !imageUri} style={styles.photoBtn} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>Service type</Text>
        <View style={styles.catWrap}>
          {(serviceTypes.length ? serviceTypes : [{ service_type: 'general', display_name: 'General' } as ServiceTypeSchemaRow]).map(
            (t) => {
              const id = t.service_type;
              const on = serviceType === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    setServiceType(id);
                    setFieldValues({});
                    setMetadataExtraJson('{}');
                  }}
                  style={[styles.catPill, on && styles.catOn]}
                >
                  <Text style={[styles.catText, on && styles.catTextOn]} numberOfLines={1}>
                    {t.display_name || id}
                  </Text>
                </Pressable>
              );
            },
          )}
        </View>
        {activeSchema?.description ? (
          <Text style={styles.hint}>{activeSchema.description}</Text>
        ) : null}

        <Text style={styles.section2}>Tags</Text>
        <TextField
          label="Comma-separated (e.g. burger, delivery, halal)"
          value={tagsStr}
          onChangeText={setTagsStr}
        />

        {schemaFields.length ? (
          <>
            <Text style={styles.section2}>Type-specific details</Text>
            {schemaFields.map((f) => (
              <TextField
                key={f.key}
                label={`${f.label ?? f.key}${f.type === 'array' ? ' (JSON array)' : ''}`}
                value={fieldValues[f.key] ?? ''}
                onChangeText={(v) => setFieldValues((prev) => ({ ...prev, [f.key]: v }))}
                multiline={f.type === 'array'}
              />
            ))}
          </>
        ) : (
          <>
            <Text style={styles.section2}>Metadata (JSON)</Text>
            <TextField
              label="Optional structured data for this listing"
              value={metadataExtraJson}
              onChangeText={setMetadataExtraJson}
              multiline
            />
          </>
        )}

        {schemaFields.length ? (
          <>
            <Text style={styles.section2}>Extra metadata (JSON)</Text>
            <TextField label="Merge with fields above" value={metadataExtraJson} onChangeText={setMetadataExtraJson} multiline />
          </>
        ) : null}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.section}>Details</Text>
        <TextField label="Title" value={title} onChangeText={setTitle} />
        <TextField label="Description" value={description} onChangeText={setDescription} multiline />
        <TextField
          label="Extra image URLs (one per line, https…)"
          value={galleryUrlsStr}
          onChangeText={setGalleryUrlsStr}
          multiline
        />
        <TextField label="Price (USD)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

        <Text style={styles.section2}>Category</Text>
        <View style={styles.catWrap}>
          <Pressable onPress={() => setCategoryId(null)} style={[styles.catPill, !categoryId && styles.catOn]}>
            <Text style={[styles.catText, !categoryId && styles.catTextOn]}>None</Text>
          </Pressable>
          {categories.map((c) => {
            const on = categoryId === c.id;
            return (
              <Pressable key={c.id} onPress={() => setCategoryId(c.id)} style={[styles.catPill, on && styles.catOn]}>
                <Text style={[styles.catText, on && styles.catTextOn]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => setIsActive((v) => !v)} style={styles.toggleRow}>
          <Ionicons name={isActive ? 'checkbox-outline' : 'square-outline'} size={20} color={colors.primary} />
          <Text style={styles.toggleText}>Service is active</Text>
        </Pressable>
      </Card>

      <PrimaryButton title={busy ? 'Saving…' : 'Save service'} onPress={() => void save()} disabled={busy || !canSave || !providerId} />
      {serviceId ? (
        <PrimaryButton title="Delete service" variant="outline" onPress={() => void remove()} disabled={busy} style={styles.deleteBtn} />
      ) : null}

      <ScanningOverlay visible={scanning} imageUri={imageUri} title="Scanning your photo…" subtitle="Gearup is generating a service description" />
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.sm, marginBottom: spacing.md, fontSize: 26, fontWeight: '900', color: colors.text },
  card: { marginBottom: spacing.sm },
  section: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: spacing.sm },
  section2: { fontSize: 14, fontWeight: '900', color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  image: { height: 220, borderRadius: radius.lg, backgroundColor: colors.background, overflow: 'hidden' },
  photoRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  photoBtn: { flex: 1 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catPill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  catOn: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  catText: { color: colors.textSecondary, fontWeight: '800' },
  catTextOn: { color: colors.primaryDark },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  toggleText: { fontWeight: '800', color: colors.text },
  deleteBtn: { marginTop: spacing.sm },
  busy: { marginTop: spacing.md, alignItems: 'center' },
});

