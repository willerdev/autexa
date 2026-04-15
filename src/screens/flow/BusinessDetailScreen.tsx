import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchPublicProvider, resolveProviderServiceId, fetchPublicService } from '../../api/serviceDetail';
import { listProviderProducts, type ProviderProductRow } from '../../api/providerProducts';
import { supabase } from '../../lib/supabase';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { BusinessDetailSkeleton, Card, ScreenScroll } from '../../components';
import { getErrorMessage } from '../../lib/errors';
import * as ImagePicker from 'expo-image-picker';
import { uploadProviderListingImageFromBase64, uploadServiceGalleryImageFromBase64 } from '../../api/serviceImages';
import { useUiStore } from '../../stores/uiStore';

type Props = NativeStackScreenProps<AppStackParamList, 'BusinessDetail'>;

function fmtPrice(cents: number): string {
  if (!Number.isFinite(Number(cents)) || cents <= 0) return 'Quote';
  return `UGX ${Math.round(cents / 100).toLocaleString()}`;
}

function maskPhone(phone: string): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 6) return phone?.trim() ? 'Phone on file' : 'Phone not available';
  const last = digits.slice(-2);
  const prefix = digits.startsWith('256') ? '+256' : digits.startsWith('0') ? '' : '+';
  const mid = digits.slice(Math.max(0, digits.length - 9), -2);
  const maskedMid = mid.replace(/\d/g, '•');
  return `${prefix}${digits.startsWith('256') ? digits.slice(3, -2) : digits.slice(0, -2)}${maskedMid}${last}`.slice(0, 22);
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <View style={[styles.tabUnderline, active ? styles.tabUnderlineOn : styles.tabUnderlineOff]} />
    </Pressable>
  );
}

export function BusinessDetailScreen({ navigation, route }: Props) {
  const { providerId } = route.params;
  const setNavFocusedLeafName = useUiStore((s) => s.setNavFocusedLeafName);
  const appMode = useUiStore((s) => s.appMode);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Awaited<ReturnType<typeof fetchPublicProvider>>['data']>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [service, setService] = useState<Awaited<ReturnType<typeof fetchPublicService>>['data']>(null);
  const [products, setProducts] = useState<ProviderProductRow[]>([]);
  const [tab, setTab] = useState<'services' | 'info' | 'catering' | 'dropoff'>('services');
  const [isOwner, setIsOwner] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftLocation, setDraftLocation] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftWorkingDays, setDraftWorkingDays] = useState('');
  const [draftLat, setDraftLat] = useState('');
  const [draftLng, setDraftLng] = useState('');
  const [mainPhotoUrl, setMainPhotoUrl] = useState<string | null>(null);
  const scrollY = useState(() => new Animated.Value(0))[0];
  const [actionsOpen, setActionsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newImgs, setNewImgs] = useState<Array<{ uri: string; base64: string }>>([]);
  const [deliveryMode, setDeliveryMode] = useState<'pickup' | 'delivery' | 'both'>('pickup');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryIds, setDeliveryIds] = useState<Set<string>>(new Set());

  const isProduct = Boolean(provider?.is_product_business);
  const isProviderAppMode = appMode === 'provider';

  useEffect(() => {
    setNavFocusedLeafName('BusinessDetail');
    return () => setNavFocusedLeafName(undefined);
  }, [setNavFocusedLeafName]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id ?? null;

        const p = await fetchPublicProvider(providerId);
        if (cancelled) return;
        if (p.error) throw p.error;
        setProvider(p.data);
        const owner = Boolean(uid && p.data?.created_by_user_id && uid === p.data.created_by_user_id);
        setIsOwner(owner);
        if (p.data) {
          setDraftName(p.data.name ?? '');
          setDraftLocation(p.data.location ?? '');
          setDraftPhone(p.data.phone ?? '');
          setDraftWorkingDays(p.data.working_days ?? '');
          setDraftLat(p.data.lat != null ? String(p.data.lat) : '');
          setDraftLng(p.data.lng != null ? String(p.data.lng) : '');
          setDeliveryMode((p.data.delivery_mode as any) ?? 'pickup');
          setDeliveryArea((p.data.delivery_area as any) ?? '');
        }

        if (p.data?.is_product_business) {
          setTab('catering');
          const r = await listProviderProducts(providerId);
          if (r.error) throw r.error;
          if (!cancelled) setProducts(r.data);
        } else {
          setTab('services');
          const resolved = await resolveProviderServiceId(providerId, null);
          if (resolved.error) throw resolved.error;
          setServiceId(resolved.serviceId);
          if (resolved.serviceId) {
            const s = await fetchPublicService(resolved.serviceId);
            if (s.error) throw s.error;
            if (!cancelled) setService(s.data);
          }
        }
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const refresh = useCallback(async () => {
    const p = await fetchPublicProvider(providerId);
    if (p.error) throw p.error;
    setProvider(p.data);
  }, [providerId]);

  const loadDeliveryList = useCallback(async () => {
    if (!provider) return;
    const { data, error: err } = await supabase
      .from('provider_delivery_items')
      .select('product_id')
      .eq('provider_id', provider.id);
    if (err) return;
    setDeliveryIds(new Set<string>((data ?? []).map((r: any) => String(r.product_id))));
  }, [provider]);

  const uniqueUrls = useMemo(() => {
    const urls = [
      ...(provider?.image_url ? [provider.image_url] : []),
      ...((provider?.gallery_urls ?? []) as string[]),
    ].filter(Boolean);
    // De-dupe while keeping order
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of urls) {
      if (!seen.has(u)) {
        out.push(u);
        seen.add(u);
      }
    }
    return out;
  }, [provider?.gallery_urls, provider?.image_url]);

  useEffect(() => {
    setMainPhotoUrl(uniqueUrls[0] ?? null);
  }, [uniqueUrls]);

  const heroMax = 190;
  const heroMin = 72;
  const heroRange = heroMax - heroMin;
  const heroHeight = scrollY.interpolate({
    inputRange: [0, heroRange],
    outputRange: [heroMax, heroMin],
    extrapolate: 'clamp',
  });
  const heroImageTranslateY = scrollY.interpolate({
    inputRange: [0, heroRange],
    outputRange: [0, -22],
    extrapolate: 'clamp',
  });
  const heroShadeOpacity = scrollY.interpolate({
    inputRange: [0, heroRange],
    outputRange: [0.18, 0.34],
    extrapolate: 'clamp',
  });
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false });

  const saveEdits = useCallback(async () => {
    if (!provider) return;
    try {
      setSaving(true);
      const latNum = draftLat.trim() ? Number(draftLat.trim()) : null;
      const lngNum = draftLng.trim() ? Number(draftLng.trim()) : null;
      if ((latNum != null && !Number.isFinite(latNum)) || (lngNum != null && !Number.isFinite(lngNum))) {
        Alert.alert('Edit business', 'Latitude/longitude must be valid numbers.');
        return;
      }
      const { error: upErr } = await supabase
        .from('providers')
        .update({
          name: draftName.trim(),
          location: draftLocation.trim(),
          phone: draftPhone.trim(),
          working_days: draftWorkingDays.trim(),
          lat: latNum,
          lng: lngNum,
        })
        .eq('id', provider.id);
      if (upErr) throw new Error(upErr.message);
      await refresh();
      setEditOpen(false);
    } catch (e) {
      Alert.alert('Edit failed', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draftLat, draftLng, draftLocation, draftName, draftPhone, draftWorkingDays, provider, refresh]);

  const addPhotos = useCallback(async () => {
    if (!provider) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Photos', 'Allow photo library access to add photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.9,
      base64: true,
    });
    if (res.canceled) return;

    try {
      setSaving(true);
      const picked = res.assets
        .filter((a) => Boolean(a.uri) && Boolean(a.base64))
        .map((a) => ({ uri: a.uri, base64: String(a.base64) }));

      const urls = [...uniqueUrls];
      for (const p of picked) {
        const { url, error } = await uploadProviderListingImageFromBase64({
          providerId: provider.id,
          base64: p.base64,
          sourceUri: p.uri,
        });
        if (error) throw error;
        if (url) urls.push(url);
      }

      const dedup = Array.from(new Set(urls));
      const imageUrl = dedup[0] ?? null;
      const { error: upErr } = await supabase
        .from('providers')
        .update({ image_url: imageUrl, gallery_urls: dedup })
        .eq('id', provider.id);
      if (upErr) throw new Error(upErr.message);

      await refresh();
    } catch (e) {
      Alert.alert('Photos', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [provider, refresh, uniqueUrls]);

  const pickImages = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Photos', 'Allow photo library access to pick a photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.9,
      base64: true,
    });
    if (res.canceled) return;
    const picked = res.assets
      .filter((a) => Boolean(a.uri) && Boolean(a.base64))
      .map((a) => ({ uri: a.uri, base64: String(a.base64) }))
      .slice(0, 6);
    setNewImgs(picked);
  }, []);

  const addItem = useCallback(async () => {
    if (!provider) return;
    const title = newTitle.trim();
    if (!title) {
      Alert.alert(isProduct ? 'Add product' : 'Add service', 'Enter a title.');
      return;
    }
    const priceCents = Math.max(0, Math.round(Number(newPrice || 0) * 100));
    try {
      setSaving(true);
      let imageUrl: string | null = null;
      const galleryUrls: string[] = [];
      if (newImgs.length) {
        for (const img of newImgs) {
          const { url, error } = await uploadServiceGalleryImageFromBase64({
            providerId: provider.id,
            base64: img.base64,
            sourceUri: img.uri,
          });
          if (error) throw error;
          if (url) galleryUrls.push(url);
        }
        imageUrl = galleryUrls[0] ?? null;
      }
      if (isProduct) {
        const { error } = await supabase.from('provider_products').insert({
          provider_id: provider.id,
          title,
          description: newDesc.trim(),
          price_cents: priceCents,
          image_url: imageUrl,
          gallery_urls: galleryUrls,
          is_active: true,
        });
        if (error) throw new Error(error.message);
        const r = await listProviderProducts(provider.id);
        if (r.error) throw r.error;
        setProducts(r.data);
      } else {
        const { error } = await supabase.from('provider_services').insert({
          provider_id: provider.id,
          title,
          description: newDesc.trim(),
          price_cents: priceCents,
          image_url: imageUrl,
          gallery_urls: galleryUrls,
          is_active: true,
        });
        if (error) throw new Error(error.message);
        const resolved = await resolveProviderServiceId(provider.id, title);
        if (!resolved.error) setServiceId(resolved.serviceId);
      }
      setAddOpen(false);
      setActionsOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewPrice('');
      setNewImgs([]);
    } catch (e) {
      Alert.alert('Add failed', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [isProduct, newDesc, newImgs, newPrice, newTitle, provider]);

  const deactivate = useCallback(async () => {
    if (!provider) return;
    Alert.alert('Remove listing?', 'This will hide the business from Explore and Search.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Hide listing',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setSaving(true);
              const { error: upErr } = await supabase.from('providers').update({ is_available: false }).eq('id', provider.id);
              if (upErr) throw new Error(upErr.message);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Remove failed', getErrorMessage(e));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }, [navigation, provider]);

  const headerTitle = provider?.name ?? 'Business';

  useEffect(() => {
    navigation.setOptions({ title: headerTitle });
  }, [navigation, headerTitle]);

  const ratingLine = useMemo(() => {
    const r = Number(provider?.rating ?? 0);
    const reviewCount = Math.max(12, Math.round((Number.isFinite(r) ? r : 4.5) * 28));
    return `${(Number.isFinite(r) ? r : 4.5).toFixed(1)} (${reviewCount} reviews)`;
  }, [provider?.rating]);

  const ownerSheet = (
    <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit business</Text>
          <TextInput value={draftName} onChangeText={setDraftName} placeholder="Business name" style={styles.input} />
          <TextInput value={draftLocation} onChangeText={setDraftLocation} placeholder="Address / location" style={styles.input} />
          <TextInput value={draftPhone} onChangeText={setDraftPhone} placeholder="Phone" style={styles.input} keyboardType="phone-pad" />
          <TextInput value={draftWorkingDays} onChangeText={setDraftWorkingDays} placeholder="Working days" style={styles.input} />
          <View style={styles.modalRow}>
            <TextInput value={draftLat} onChangeText={setDraftLat} placeholder="Lat" style={[styles.input, styles.modalFlex]} keyboardType="numeric" />
            <TextInput value={draftLng} onChangeText={setDraftLng} placeholder="Lng" style={[styles.input, styles.modalFlex]} keyboardType="numeric" />
          </View>
          <View style={styles.modalRow}>
            <Pressable style={({ pressed }) => [styles.modalBtn, pressed && styles.modalBtnPressed]} onPress={() => setEditOpen(false)} disabled={saving}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalBtnPrimary, (pressed || saving) && styles.modalBtnPressed]}
              onPress={() => void saveEdits()}
              disabled={saving}
            >
              <Text style={styles.modalBtnPrimaryText}>{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <ScreenScroll edges={['left', 'right']}>
        <BusinessDetailSkeleton />
      </ScreenScroll>
    );
  }

  if (error || !provider) {
    return (
      <ScreenScroll edges={['left', 'right']} contentContainerStyle={styles.center}>
        <Text style={styles.errTitle}>Could not load business</Text>
        <Text style={styles.errBody}>{error || 'Unknown error'}</Text>
      </ScreenScroll>
    );
  }

  // Product business layout (reference-like)
  if (isProduct) {
    return (
      <ScreenScroll
        edges={['left', 'right']}
        contentContainerStyle={[styles.wrap, { paddingHorizontal: 0, flexGrow: 0 }]}
        onScroll={onScroll}
        animated
        floatingChildren={
          isOwner ? (
            <Pressable style={styles.bizFab} onPress={() => setActionsOpen(true)} hitSlop={10}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </Pressable>
          ) : null
        }
      >
        {ownerSheet}
        <Animated.View style={[styles.heroFrameFull, { height: heroHeight }]}>
          {mainPhotoUrl ? (
            <Animated.Image
              source={{ uri: mainPhotoUrl }}
              style={[styles.heroBg, { transform: [{ translateY: heroImageTranslateY }] }]}
            />
          ) : null}
          <Animated.View style={[styles.heroShade, { opacity: heroShadeOpacity }]} />
          <View style={styles.heroTopRow} />
        </Animated.View>

        {uniqueUrls.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.carouselWrap}
            contentContainerStyle={styles.carouselContent}
          >
            {uniqueUrls.slice(0, 12).map((u, idx) => {
              const active = u === mainPhotoUrl;
              return (
                <Pressable key={`${u}-${idx}`} onPress={() => setMainPhotoUrl(u)} style={styles.thumbPress}>
                  <Image source={{ uri: u }} style={[styles.thumbImg, active && styles.thumbImgActive]} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <Card style={styles.heroCardFloating}>
          <Text style={styles.heroName} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={styles.heroMetaRow}>
            <Ionicons name="star" size={16} color={colors.star} />
            <Text style={styles.heroMeta}>{ratingLine}</Text>
            <Text style={styles.heroMetaSep}>|</Text>
            <Text style={styles.heroMeta}>Vendor policy</Text>
          </View>
        </Card>

        <View style={styles.tabsLine}>
          <Tab label="Catalog" active={tab === 'catering'} onPress={() => setTab('catering')} />
          <Tab
            label={isOwner ? 'Delivery' : 'Drop off'}
            active={tab === 'dropoff'}
            onPress={() => {
              setTab('dropoff');
              if (isOwner) void loadDeliveryList();
            }}
          />
        </View>

        <View style={styles.listWrap}>
          {tab === 'dropoff' ? (
            <Card style={styles.deliveryCard}>
              {isOwner ? (
                <>
                  <Text style={styles.blockTitle}>Delivery options</Text>
                  <View style={styles.deliveryModeRow}>
                    {(['pickup', 'delivery', 'both'] as const).map((m) => (
                      <Pressable
                        key={m}
                        style={[styles.modeChip, deliveryMode === m ? styles.modeChipOn : styles.modeChipOff]}
                        onPress={() => setDeliveryMode(m)}
                      >
                        <Text style={[styles.modeChipText, deliveryMode === m ? styles.modeChipTextOn : styles.modeChipTextOff]}>
                          {m === 'pickup' ? 'Pickup' : m === 'delivery' ? 'Delivery' : 'Both'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={deliveryArea}
                    onChangeText={setDeliveryArea}
                    placeholder="Delivery area (e.g. Kampala within 10km)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.saveDeliveryBtn, pressed && { opacity: 0.9 }]}
                    onPress={() =>
                      void (async () => {
                        if (!provider) return;
                        try {
                          setSaving(true);
                          const { error: upErr } = await supabase
                            .from('providers')
                            .update({ delivery_mode: deliveryMode, delivery_area: deliveryArea.trim() })
                            .eq('id', provider.id);
                          if (upErr) throw new Error(upErr.message);
                          await refresh();
                        } catch (e) {
                          Alert.alert('Delivery', getErrorMessage(e));
                        } finally {
                          setSaving(false);
                        }
                      })()
                    }
                    disabled={saving}
                  >
                    <Text style={styles.saveDeliveryText}>{saving ? 'Saving…' : 'Save delivery settings'}</Text>
                  </Pressable>

                  <Text style={[styles.blockTitle, { marginTop: spacing.sm }]}>Products on delivery list</Text>
                  {products.length ? (
                    products.map((p) => {
                      const on = deliveryIds.has(p.id);
                      return (
                        <Pressable
                          key={p.id}
                          style={styles.deliveryItemRow}
                          onPress={() =>
                            void (async () => {
                              if (!provider) return;
                              try {
                                setSaving(true);
                                if (on) {
                                  const { error } = await supabase
                                    .from('provider_delivery_items')
                                    .delete()
                                    .eq('provider_id', provider.id)
                                    .eq('product_id', p.id);
                                  if (error) throw new Error(error.message);
                                } else {
                                  const { error } = await supabase
                                    .from('provider_delivery_items')
                                    .insert({ provider_id: provider.id, product_id: p.id });
                                  if (error) throw new Error(error.message);
                                }
                                await loadDeliveryList();
                              } catch (e) {
                                Alert.alert('Delivery list', getErrorMessage(e));
                              } finally {
                                setSaving(false);
                              }
                            })()
                          }
                          disabled={saving}
                        >
                          <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.primary : colors.textMuted} />
                          <Text style={styles.deliveryItemText} numberOfLines={1}>
                            {p.title}
                          </Text>
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.empty}>Add products first, then select them here.</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.blockTitle}>Drop off / pickup</Text>
                  <Text style={styles.infoValue}>Contact the business to confirm drop-off details.</Text>
                </>
              )}
            </Card>
          ) : null}

          {tab === 'dropoff' ? null : products.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.empty}>No products posted yet.</Text>
              {isOwner ? (
                <Pressable style={styles.inlineAdd} onPress={() => setAddOpen(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.inlineAddText}>Add your first product</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : (
            <>
              {isOwner ? (
                <Pressable style={styles.addMoreRow} onPress={() => setAddOpen(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.addMoreText}>Add another product</Text>
                </Pressable>
              ) : null}
              {products.map((p) => (
                <View key={p.id} style={styles.productRow}>
                <View style={styles.productMain}>
                  <Text style={styles.productTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.productDesc} numberOfLines={2}>
                    {p.description || ' '}
                  </Text>
                  <Text style={styles.productPrice}>{fmtPrice(p.price_cents)}</Text>
                </View>
                  {isOwner ? (
                    <Pressable
                      style={styles.productDelete}
                      onPress={() =>
                        Alert.alert('Delete product?', 'This will remove it from your catalog.', [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => {
                              void (async () => {
                                try {
                                  setSaving(true);
                                  const { error } = await supabase.from('provider_products').delete().eq('id', p.id);
                                  if (error) throw new Error(error.message);
                                  const r = await listProviderProducts(providerId);
                                  if (r.error) throw r.error;
                                  setProducts(r.data);
                                } catch (e) {
                                  Alert.alert('Delete failed', getErrorMessage(e));
                                } finally {
                                  setSaving(false);
                                }
                              })();
                            },
                          },
                        ])
                      }
                      disabled={saving}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  ) : null}
                {p.image_url ? (
                  <Image source={{ uri: p.image_url }} style={styles.productThumbImg} />
                ) : (
                  <View style={styles.productThumb}>
                    <Ionicons name="image-outline" size={22} color="rgba(24,24,27,0.22)" />
                  </View>
                )}
                </View>
              ))}
            </>
          )}
        </View>

        {isOwner ? (
          <>
            <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
              <Pressable style={styles.sheetBackdrop} onPress={() => setActionsOpen(false)}>
                <View />
              </Pressable>
              <View style={styles.sheetCard}>
                <Text style={styles.sheetTitle}>Business actions</Text>
                <Pressable style={styles.sheetRow} onPress={() => { setActionsOpen(false); setEditOpen(true); }}>
                  <Ionicons name="create-outline" size={18} color={colors.text} />
                  <Text style={styles.sheetRowText}>Edit details</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={() => { setActionsOpen(false); void addPhotos(); }}>
                  <Ionicons name="images-outline" size={18} color={colors.text} />
                  <Text style={styles.sheetRowText}>Add photos</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={() => setAddOpen(true)}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.text} />
                  <Text style={styles.sheetRowText}>Add product</Text>
                </Pressable>
                <Pressable style={[styles.sheetRow, styles.sheetRowDanger]} onPress={() => { setActionsOpen(false); void deactivate(); }}>
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.sheetRowTextDanger}>Hide listing</Text>
                </Pressable>
              </View>
            </Modal>

            <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
              <View style={styles.modalBackdrop}>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
                >
                  <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Add product</Text>
                    <TextInput
                      value={newTitle}
                      onChangeText={setNewTitle}
                      placeholder="Product name (e.g. Burger combo)"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                    />
                    <TextInput
                      value={newDesc}
                      onChangeText={setNewDesc}
                      placeholder="Description (optional)"
                      placeholderTextColor={colors.textMuted}
                      style={[styles.input, styles.inputMultiline]}
                      multiline
                    />
                    <TextInput
                      value={newPrice}
                      onChangeText={setNewPrice}
                      placeholder="Price (UGX) e.g. 25000"
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                      keyboardType="numeric"
                    />
                    <Pressable style={styles.pickImgRow} onPress={() => void pickImages()}>
                      <Ionicons name="image-outline" size={18} color={colors.textSecondary} />
                      <Text style={styles.pickImgText}>
                        {newImgs.length ? `Change images (${newImgs.length} selected)` : 'Pick images (up to 6)'}
                      </Text>
                    </Pressable>
                    <View style={styles.modalRow}>
                      <Pressable
                        style={({ pressed }) => [styles.modalBtn, pressed && styles.modalBtnPressed]}
                        onPress={() => setAddOpen(false)}
                        disabled={saving}
                      >
                        <Text style={styles.modalBtnText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.modalBtnPrimary, (pressed || saving) && styles.modalBtnPressed]}
                        onPress={() => void addItem()}
                        disabled={saving}
                      >
                        <Text style={styles.modalBtnPrimaryText}>{saving ? 'Saving…' : 'Add'}</Text>
                      </Pressable>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </View>
            </Modal>
          </>
        ) : null}
      </ScreenScroll>
    );
  }

  // Service business layout
  return (
    <ScreenScroll edges={['left', 'right']} contentContainerStyle={[styles.wrap, { flexGrow: 0 }]} onScroll={onScroll} animated>
      {ownerSheet}
      <Animated.View style={[styles.heroFrameFull, { height: heroHeight }]}>
        {mainPhotoUrl ? (
          <Animated.Image
            source={{ uri: mainPhotoUrl }}
            style={[styles.heroBg, { transform: [{ translateY: heroImageTranslateY }] }]}
          />
        ) : null}
        <Animated.View style={[styles.heroShade, { opacity: heroShadeOpacity }]} />
        <View style={styles.heroTopRow} />
      </Animated.View>

      {uniqueUrls.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.carouselWrap}
          contentContainerStyle={styles.carouselContent}
        >
          {uniqueUrls.slice(0, 12).map((u, idx) => {
            const active = u === mainPhotoUrl;
            return (
              <Pressable key={`${u}-${idx}`} onPress={() => setMainPhotoUrl(u)} style={styles.thumbPress}>
                <Image source={{ uri: u }} style={[styles.thumbImg, active && styles.thumbImgActive]} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Card style={styles.heroCardFloating}>
          <Text style={styles.serviceName} numberOfLines={1}>
            {provider.name}
          </Text>
          <View style={styles.serviceMetaRow}>
            <Ionicons name="star" size={16} color={colors.star} />
            <Text style={styles.serviceMeta}>{ratingLine}</Text>
          </View>
          <Text style={styles.serviceType} numberOfLines={1}>
            {provider.service_type}
          </Text>
      </Card>

      <View style={styles.tabsLine}>
        <Tab label="Services" active={tab === 'services'} onPress={() => setTab('services')} />
        <Tab label="Info" active={tab === 'info'} onPress={() => setTab('info')} />
      </View>

      {tab === 'info' ? (
        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Working days</Text>
              <Text style={styles.infoValue}>{provider.working_days?.trim() ? provider.working_days : 'Not set'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={colors.textSecondary} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{provider.location || 'Not set'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={18} color={colors.textSecondary} />
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Tel</Text>
              <Text style={styles.infoValue}>{maskPhone(provider.phone || '')}</Text>
            </View>
          </View>
        </Card>
      ) : (
        <View style={styles.listWrap}>
          {serviceId && service ? (
            <>
              <Text style={styles.servicesHint}>Tap “Book Now” to continue booking.</Text>
              <View style={styles.serviceRow}>
                <View style={styles.serviceRowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {service.title}
                  </Text>
                  <Text style={styles.rowDesc} numberOfLines={2}>
                    {service.description || ' '}
                  </Text>
                  <Text style={styles.rowPrice}>{fmtPrice(service.price_cents)}</Text>
                </View>
                <Pressable
                  onPress={() =>
                    navigation.navigate('BookingConfirm', {
                      providerId: provider.id,
                      providerName: provider.name,
                      providerServiceId: service.id,
                      serviceName: provider.service_type,
                    })
                  }
                  style={({ pressed }) => [styles.bookBtn, pressed && styles.bookBtnPressed]}
                >
                  <Text style={styles.bookBtnText}>Book Now</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.empty}>No active services posted yet.</Text>
          )}
        </View>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  center: { padding: spacing.lg, alignItems: 'center' },
  errTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  errBody: { marginTop: 6, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  wrap: { paddingBottom: spacing.xxl, paddingTop: 0 },

  heroFrameFull: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  heroBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' },
  heroShade: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#000' },
  heroTopRow: { padding: spacing.sm, alignItems: 'flex-end' },
  heroCardFloating: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  carouselWrap: { marginTop: 2, paddingLeft: spacing.md },
  carouselContent: { gap: spacing.sm, paddingRight: spacing.md, paddingBottom: spacing.xs },
  thumbPress: { borderRadius: radius.lg, overflow: 'hidden' },
  thumbImg: { width: 92, height: 64, borderRadius: radius.lg, backgroundColor: colors.border, borderWidth: 1, borderColor: colors.border },
  thumbImgActive: { borderColor: colors.primary, borderWidth: 2 },
  heroName: { fontSize: 20, fontWeight: '900', color: colors.text },
  heroMetaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMeta: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  heroMetaSep: { fontSize: 12, color: colors.textMuted },

  blockTitle: { fontSize: 14, fontWeight: '900', color: colors.text },

  serviceHeader: { marginTop: spacing.md, marginHorizontal: spacing.md, padding: spacing.md },
  serviceName: { fontSize: 20, fontWeight: '900', color: colors.text },
  serviceMetaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 },
  serviceMeta: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  serviceType: { marginTop: 6, fontSize: 13, fontWeight: '800', color: colors.primary },

  tabsLine: {
    marginTop: 4,
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'space-around',
  },
  tabBtn: { paddingVertical: spacing.sm },
  tabText: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  tabUnderline: { marginTop: 8, height: 2, borderRadius: 2 },
  tabUnderlineOn: { backgroundColor: colors.primary },
  tabUnderlineOff: { backgroundColor: 'transparent' },

  listWrap: { paddingHorizontal: spacing.md, paddingTop: 2 },
  empty: { marginTop: spacing.md, color: colors.textMuted, textAlign: 'center' },
  emptyCard: { marginTop: spacing.sm, marginHorizontal: 0, padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  inlineAdd: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xs },
  inlineAddText: { fontWeight: '900', color: colors.primary },

  deliveryCard: { marginTop: spacing.xs, padding: spacing.md, gap: spacing.sm },
  deliveryModeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modeChip: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  modeChipOn: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  modeChipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  modeChipText: { fontSize: 12, fontWeight: '900' },
  modeChipTextOn: { color: colors.primaryDark },
  modeChipTextOff: { color: colors.textSecondary },
  saveDeliveryBtn: { marginTop: spacing.xs, backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: 12, alignItems: 'center' },
  saveDeliveryText: { color: '#fff', fontWeight: '900' },
  deliveryItemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  deliveryItemText: { flex: 1, fontWeight: '800', color: colors.text },

  bizFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  sheetBackdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetCard: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: { fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  sheetRowText: { fontWeight: '800', color: colors.text },
  sheetRowDanger: { backgroundColor: colors.danger, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  sheetRowTextDanger: { fontWeight: '900', color: '#fff' },
  pickImgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  pickImgText: { color: colors.textSecondary, fontWeight: '700' },

  productRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  addMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  addMoreText: { fontWeight: '900', color: colors.primary },
  productDelete: { padding: 8, marginRight: -6 },
  productMain: { flex: 1, minWidth: 0 },
  productTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  productDesc: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  productPrice: { marginTop: 8, fontSize: 14, fontWeight: '900', color: colors.text },
  productThumb: {
    width: 74,
    height: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  productThumbImg: {
    width: 74,
    height: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  modalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  modalFlex: { flex: 1 },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.border,
  },
  modalBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
  },
  modalBtnPressed: { opacity: 0.88 },
  modalBtnText: { fontWeight: '900', color: colors.text },
  modalBtnPrimaryText: { fontWeight: '900', color: '#fff' },

  infoCard: { marginTop: spacing.md, marginHorizontal: spacing.md, padding: spacing.lg },
  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', marginBottom: spacing.md },
  infoCol: { flex: 1 },
  infoLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  infoValue: { marginTop: 3, fontSize: 14, fontWeight: '700', color: colors.text },

  servicesHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm, textAlign: 'center' },
  serviceRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  serviceRowMain: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  rowDesc: { marginTop: 4, fontSize: 12, color: colors.textMuted },
  rowPrice: { marginTop: 8, fontSize: 14, fontWeight: '900', color: colors.primary },
  bookBtn: {
    marginTop: spacing.md,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  bookBtnPressed: { opacity: 0.92 },
  bookBtnText: { color: '#fff', fontWeight: '900' },
});

