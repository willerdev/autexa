import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { createBooking } from '../../api/bookings';
import {
  averageRating,
  fetchPublicProvider,
  fetchPublicService,
  listServiceReviews,
  patchProviderServiceListing,
  replyToServiceReview,
  resolveProviderServiceId,
  submitServiceReview,
  type PublicProviderDetail,
  type PublicServiceDetail,
  type ServiceReviewRow,
} from '../../api/serviceDetail';
import { uploadServiceGalleryImage } from '../../api/serviceImages';
import { getMyProviderProfile } from '../../api/providerDashboard';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import { supabase } from '../../lib/supabase';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { addDays, formatDateChipLabel, toLocalDateString } from '../../utils/dateFormat';
import { getErrorMessage } from '../../lib/errors';
import { useSessionStore } from '../../stores/sessionStore';
import { openCheckoutForBooking } from '../../utils/payments';

type Props = NativeStackScreenProps<AppStackParamList, 'BookingConfirm'>;

const times = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '4:30 PM', '6:00 PM'];
const FALLBACK_DEPOSIT_CENTS = 4500;

type MomoProvider = 'mtn' | 'airtel';

function favKey(providerId: string, sid: string | null) {
  return `autexa:fav:${providerId}:${sid ?? 'none'}`;
}

function galleryUrls(svc: PublicServiceDetail | null): string[] {
  if (!svc) return [];
  const main = svc.image_url ? [svc.image_url] : [];
  const extra = (svc.gallery_urls ?? []).filter(Boolean);
  return [...new Set([...main, ...extra])];
}

function StarRow({ value, size = 18 }: { value: number; size?: number }) {
  const rounded = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= rounded ? 'star' : 'star-outline'}
          size={size}
          color={colors.star}
        />
      ))}
    </View>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.starPickRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={6}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={32} color={colors.star} />
        </Pressable>
      ))}
    </View>
  );
}

export function BookingConfirmScreen({ route }: Props) {
  const navigation = useNavigation();
  const { width: winW } = useWindowDimensions();
  const heroSlideW = Math.max(280, winW - spacing.lg * 2);
  const {
    providerId,
    providerName,
    serviceName,
    providerServiceId: paramServiceId,
    bookingId: existingBookingId,
    date: existingDate,
    time: existingTime,
    paymentMethod: existingPaymentMethod,
  } = route.params;

  const [provider, setProvider] = useState<PublicProviderDetail | null>(null);
  const [service, setService] = useState<PublicServiceDetail | null>(null);
  const [resolvedServiceId, setResolvedServiceId] = useState<string | null>(paramServiceId ?? null);
  const [reviews, setReviews] = useState<ServiceReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);

  const [dateIdx, setDateIdx] = useState(0);
  const [timeIdx, setTimeIdx] = useState(1);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [mmPhone, setMmPhone] = useState('');
  const [mmProvider, setMmProvider] = useState<MomoProvider>('mtn');

  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const [ownerPrice, setOwnerPrice] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const dateSlots = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return [0, 1, 2, 3].map((i) => addDays(start, i));
  }, []);

  const selectedDate = dateSlots[dateIdx] ?? dateSlots[0];
  const dateStr = toLocalDateString(selectedDate);

  const depositCents = useMemo(() => {
    const base = service?.price_cents ?? provider?.base_price_cents ?? FALLBACK_DEPOSIT_CENTS;
    if (!service && !provider?.base_price_cents) return FALLBACK_DEPOSIT_CENTS;
    return Math.min(Math.max(2500, Math.round(base * 0.12)), Math.max(base, 2500));
  }, [service, provider]);

  const displayRating = useMemo(
    () => averageRating(reviews, provider?.rating ?? 4.5),
    [reviews, provider?.rating],
  );

  const images = useMemo(() => galleryUrls(service), [service]);

  const alreadyReviewed = useMemo(
    () => (myUserId ? reviews.some((r) => r.user_id === myUserId) : false),
    [reviews, myUserId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      setMyUserId(u.user?.id ?? null);

      const { data: p } = await fetchPublicProvider(providerId);
      setProvider(p);

      const { data: mine } = await getMyProviderProfile();
      setIsOwner(Boolean(mine?.id && mine.id === providerId));

      let sid = paramServiceId ?? null;
      if (!sid) {
        const r = await resolveProviderServiceId(providerId, serviceName ?? null);
        sid = r.serviceId;
      }
      setResolvedServiceId(sid);

      if (sid) {
        const { data: svc } = await fetchPublicService(sid);
        setService(svc);
        const { data: revs } = await listServiceReviews(sid);
        setReviews(revs);
        if (svc) setOwnerPrice(String((svc.price_cents / 100).toFixed(2)));
      } else {
        setService(null);
        setReviews([]);
        setOwnerPrice(p?.base_price_cents ? String((p.base_price_cents / 100).toFixed(2)) : '');
      }

      const key = favKey(providerId, sid);
      const stored = await AsyncStorage.getItem(key);
      setFavorite(stored === '1');
    } catch (e) {
      Alert.alert('Could not load', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [providerId, paramServiceId, serviceName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [[, ph], [, pv]] = await AsyncStorage.multiGet(['autexa:mm_phone', 'autexa:mm_provider']);
      if (ph) setMmPhone(ph);
      if (pv === 'mtn' || pv === 'airtel') setMmProvider(pv);
    })();
  }, []);

  useLayoutEffect(() => {
    const t = service?.title ?? serviceName ?? 'Book service';
    navigation.setOptions({ title: t });
  }, [navigation, service?.title, serviceName]);

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    const key = favKey(providerId, resolvedServiceId);
    await AsyncStorage.setItem(key, next ? '1' : '0');
  };

  const onShare = async () => {
    try {
      const title = service?.title ?? serviceName ?? 'Service';
      const loc = provider?.location ? ` · ${provider.location}` : '';
      await Share.share({
        message: `${title} — ${providerName}${loc}\nBook on Gearup.`,
      });
    } catch {
      /* user dismissed */
    }
  };

  const openMaps = () => {
    const q = (provider?.location ?? '').trim() || providerName;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    void Linking.openURL(url);
  };

  const confirm = async () => {
    setSaving(true);
    try {
      const { data, error } = await createBooking({
        providerId,
        date: dateStr,
        time: times[timeIdx] ?? times[0],
        serviceName: service?.title ?? serviceName,
        providerServiceId: resolvedServiceId,
        status: 'pending',
        paymentStatus: 'unpaid',
        paymentMethod: 'mobile_money',
        amountCents: depositCents,
      });
      if (error) {
        Alert.alert('Booking failed', getErrorMessage(error));
        return;
      }
      if (data?.id) {
        setBookingId(data.id);
        void useSessionStore.getState().refreshUserAiContext();
        Alert.alert(
          'Booking created',
          'Complete the deposit with MTN or Airtel mobile money (Flutterwave v4 — approve the prompt on your phone).',
          [
            { text: 'Pay now', onPress: () => void runPay(data.id) },
            { text: 'Later', style: 'cancel' },
          ],
        );
      }
    } catch (e) {
      Alert.alert('Booking failed', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const runPay = async (id: string) => {
    if (!mmPhone.trim()) {
      Alert.alert('Payment', 'Enter the MTN or Airtel number that will pay the deposit.');
      return;
    }
    setPaying(true);
    try {
      const r = await openCheckoutForBooking(id, { phone: mmPhone.trim(), provider: mmProvider });
      if (!r.ok) {
        Alert.alert('Payment', r.message ?? 'Could not start payment');
        return;
      }
      Alert.alert('Payment', r.message ?? 'Approve the deposit on your phone when prompted.');
      void useSessionStore.getState().refreshUserAiContext();
    } finally {
      setPaying(false);
    }
  };

  const submitReview = async () => {
    if (!resolvedServiceId) {
      Alert.alert('Reviews', 'This provider has no published listing yet.');
      return;
    }
    if (!myUserId) {
      Alert.alert('Sign in', 'Create an account to leave a review.');
      return;
    }
    setSubmittingReview(true);
    try {
      const { error } = await submitServiceReview(resolvedServiceId, newRating, newComment);
      if (error) {
        Alert.alert('Review', getErrorMessage(error));
        return;
      }
      setNewComment('');
      const { data: revs } = await listServiceReviews(resolvedServiceId);
      setReviews(revs);
    } finally {
      setSubmittingReview(false);
    }
  };

  const saveOwnerPrice = async () => {
    if (!resolvedServiceId || !isOwner) return;
    const dollars = parseFloat(ownerPrice.replace(',', '.'));
    if (!Number.isFinite(dollars) || dollars < 0) {
      Alert.alert('Price', 'Enter a valid amount.');
      return;
    }
    setOwnerSaving(true);
    try {
      const { error } = await patchProviderServiceListing(resolvedServiceId, {
        price_cents: Math.round(dollars * 100),
      });
      if (error) Alert.alert('Save', getErrorMessage(error));
      else {
        const { data: svc } = await fetchPublicService(resolvedServiceId);
        setService(svc);
        Alert.alert('Saved', 'Price updated.');
      }
    } finally {
      setOwnerSaving(false);
    }
  };

  const addGalleryPhoto = async () => {
    if (!resolvedServiceId || !isOwner || !providerId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photos', 'Allow photo library access to add images.');
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsMultipleSelection: false });
    if (r.canceled || !r.assets?.[0]?.uri) return;
    setGalleryBusy(true);
    try {
      const { url, error: upErr } = await uploadServiceGalleryImage(providerId, r.assets[0].uri);
      if (upErr || !url) {
        Alert.alert('Upload', upErr?.message ?? 'Upload failed');
        return;
      }
      const next = [...(service?.gallery_urls ?? []), url];
      const patch: { gallery_urls: string[]; image_url?: string | null } = { gallery_urls: next };
      if (!service?.image_url) patch.image_url = url;
      const { error } = await patchProviderServiceListing(resolvedServiceId, patch);
      if (error) Alert.alert('Save', getErrorMessage(error));
      else {
        const { data: svc } = await fetchPublicService(resolvedServiceId);
        setService(svc);
      }
    } finally {
      setGalleryBusy(false);
    }
  };

  const sendReply = async (reviewId: string) => {
    const text = (replyDrafts[reviewId] ?? '').trim();
    if (!text) return;
    try {
      const { error } = await replyToServiceReview(reviewId, text);
      if (error) {
        Alert.alert('Reply', getErrorMessage(error));
        return;
      }
      setReplyDrafts((d) => ({ ...d, [reviewId]: '' }));
      if (resolvedServiceId) {
        const { data: revs } = await listServiceReviews(resolvedServiceId);
        setReviews(revs);
      }
    } catch (e) {
      Alert.alert('Reply', getErrorMessage(e));
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScreenScroll edges={['left', 'right']}>
      <View style={styles.hero}>
        {images.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.heroScroll}>
            {images.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={[styles.heroImage, { width: heroSlideW }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="images-outline" size={56} color={colors.textMuted} />
            <Text style={styles.heroPhText}>Photos coming soon</Text>
          </View>
        )}
        <View style={styles.heroActions}>
          <Pressable style={styles.iconCircle} onPress={toggleFavorite} accessibilityLabel="Favorite">
            <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={22} color={favorite ? colors.danger : colors.text} />
          </Pressable>
          <Pressable style={styles.iconCircle} onPress={() => void onShare()} accessibilityLabel="Share">
            <Ionicons name="share-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.listingTitle}>{service?.title ?? serviceName ?? providerName}</Text>
        <Text style={styles.listingSub}>{providerName}</Text>
        <View style={styles.ratingLine}>
          <StarRow value={displayRating} />
          <Text style={styles.ratingMeta}>
            {displayRating.toFixed(1)} · {reviews.length} review{reviews.length === 1 ? '' : 's'}
          </Text>
        </View>
        {(service?.price_cents ?? provider?.base_price_cents) != null ? (
          <Text style={styles.priceBig}>
            From ${((service?.price_cents ?? provider?.base_price_cents ?? 0) / 100).toFixed(2)}
          </Text>
        ) : null}
      </View>

      <Pressable style={styles.mapBtn} onPress={openMaps}>
        <Ionicons name="map-outline" size={22} color={colors.primary} />
        <View style={styles.mapBtnTextCol}>
          <Text style={styles.mapBtnTitle}>Location</Text>
          <Text style={styles.mapBtnSub} numberOfLines={2}>
            {(provider?.location ?? '').trim() || 'View on map'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>

      {service?.description ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bodyText}>{service.description}</Text>
        </Card>
      ) : null}

      {isOwner && !resolvedServiceId ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Listing</Text>
          <Text style={styles.bodyText}>
            Add an active service under the Services tab so clients see photos, price, and reviews here.
          </Text>
        </Card>
      ) : null}

      {isOwner && resolvedServiceId ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Owner — manage listing</Text>
          <Text style={styles.ownerHint}>Update price and add photos customers will see here.</Text>
          <TextField label="Price (USD)" value={ownerPrice} onChangeText={setOwnerPrice} keyboardType="decimal-pad" />
          <PrimaryButton
            title={ownerSaving ? 'Saving…' : 'Save price'}
            onPress={() => void saveOwnerPrice()}
            disabled={ownerSaving}
            style={styles.ownerSaveBtn}
          />
          <Text style={styles.sectionTitleSmall}>Gallery</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ownerGalRow}>
            {images.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.ownerThumb} />
            ))}
            <Pressable
              style={styles.addPhotoTile}
              onPress={() => void addGalleryPhoto()}
              disabled={galleryBusy}
            >
              {galleryBusy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="add" size={28} color={colors.primary} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </Card>
      ) : null}

      {resolvedServiceId ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {reviews.length === 0 ? (
            <Text style={styles.muted}>No reviews yet.{!isOwner ? ' Be the first.' : ''}</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewItem}>
                <View style={styles.reviewHead}>
                  <Text style={styles.reviewName}>{r.users?.name?.trim() || 'Customer'}</Text>
                  <StarRow value={r.rating} size={14} />
                </View>
                <Text style={styles.reviewBody}>{r.body}</Text>
                {r.provider_reply ? (
                  <View style={styles.ownerReply}>
                    <Text style={styles.ownerReplyLabel}>Owner</Text>
                    <Text style={styles.ownerReplyText}>{r.provider_reply}</Text>
                  </View>
                ) : isOwner ? (
                  <>
                    <TextInput
                      value={replyDrafts[r.id] ?? ''}
                      onChangeText={(t) => setReplyDrafts((d) => ({ ...d, [r.id]: t }))}
                      placeholder="Write a professional reply…"
                      placeholderTextColor={colors.textMuted}
                      style={styles.replyInput}
                      multiline
                    />
                    <PrimaryButton title="Post reply" onPress={() => void sendReply(r.id)} />
                  </>
                ) : null}
              </View>
            ))
          )}

          {!isOwner && myUserId && !alreadyReviewed ? (
            <>
              <Text style={styles.sectionTitleSmall}>Rate & comment</Text>
              <StarPicker value={newRating} onChange={setNewRating} />
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Share your experience…"
                placeholderTextColor={colors.textMuted}
                style={styles.commentInput}
                multiline
              />
              <PrimaryButton
                title={submittingReview ? 'Sending…' : 'Post review'}
                onPress={() => void submitReview()}
                disabled={submittingReview}
              />
            </>
          ) : null}
          {!isOwner && myUserId && alreadyReviewed ? (
            <Text style={styles.muted}>You already reviewed this listing.</Text>
          ) : null}
          {!isOwner && !myUserId ? <Text style={styles.muted}>Sign in to rate and comment.</Text> : null}
        </Card>
      ) : null}

      <Card style={styles.summary}>
        <Text style={styles.depositLabel}>Deposit due today</Text>
        <Text style={styles.depositValue}>${(depositCents / 100).toFixed(2)}</Text>
        {existingBookingId && existingDate && existingTime ? (
          <Text style={styles.metaLine}>
            {existingDate} · {existingTime}
            {existingPaymentMethod ? ` · ${existingPaymentMethod.replace('_', ' ')}` : ''}
          </Text>
        ) : null}
      </Card>

      {myUserId && (existingBookingId || bookingId) ? (
        <Card style={styles.payMmCard}>
          <Text style={styles.payMmHint}>
            Deposit is collected in UGX on your phone via Flutterwave (no browser checkout). Use the wallet registered on
            this number.
          </Text>
          <View style={styles.toggleRow}>
            {(['mtn', 'airtel'] as const).map((p) => {
              const active = mmProvider === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setMmProvider(p)}
                  style={[styles.toggleChip, active && styles.toggleChipActive]}
                >
                  <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                    {p === 'mtn' ? 'MTN' : 'Airtel'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Mobile money number"
            keyboardType="phone-pad"
            placeholder="256…"
            value={mmPhone}
            onChangeText={setMmPhone}
          />
        </Card>
      ) : null}

      {existingBookingId ? (
        <>
          <PrimaryButton
            title={paying ? 'Starting…' : 'Pay deposit (mobile money)'}
            onPress={() => void runPay(existingBookingId)}
            loading={paying}
            disabled={paying}
            style={styles.pay}
          />
          <PrimaryButton title="Done" variant="outline" onPress={() => navigation.goBack()} style={styles.done} />
        </>
      ) : (
        <>
          <Text style={styles.section}>Date</Text>
          <View style={styles.wrap}>
            {dateSlots.map((d, i) => {
              const on = i === dateIdx;
              return (
                <Pressable key={d.toISOString()} onPress={() => setDateIdx(i)} style={[styles.tile, on && styles.tileOn]}>
                  <Text style={[styles.tileText, on && styles.tileTextOn]}>{formatDateChipLabel(d)}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.section}>Time</Text>
          <View style={styles.wrap}>
            {times.map((t, i) => {
              const on = i === timeIdx;
              return (
                <Pressable key={t} onPress={() => setTimeIdx(i)} style={[styles.timeTile, on && styles.tileOn]}>
                  <Text style={[styles.tileText, on && styles.tileTextOn]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.confirm, saving && styles.confirmDisabled]}
            onPress={() => void confirm()}
            disabled={saving || !!bookingId}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmText}>{bookingId ? 'Booking saved' : 'Create booking'}</Text>
            )}
          </Pressable>

          {bookingId ? (
            <PrimaryButton
              title={paying ? 'Starting…' : 'Pay deposit (mobile money)'}
              onPress={() => void runPay(bookingId)}
              loading={paying}
              disabled={paying}
              style={styles.pay}
            />
          ) : null}

          <PrimaryButton title="Done" variant="outline" onPress={() => navigation.goBack()} style={styles.done} />
        </>
      )}
    </ScreenScroll>
  );
}

const HERO_H = 220;

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  hero: {
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.border,
  },
  heroScroll: {
    width: '100%',
  },
  heroImage: {
    height: HERO_H,
  },
  heroPlaceholder: {
    height: HERO_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  heroPhText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  heroActions: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  titleBlock: {
    marginBottom: spacing.md,
  },
  listingTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  listingSub: {
    marginTop: 4,
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  ratingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  starRow: { flexDirection: 'row', gap: 2 },
  starPickRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  ratingMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  priceBig: {
    marginTop: spacing.sm,
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  mapBtnTextCol: { flex: 1 },
  mapBtnTitle: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase' },
  mapBtnSub: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  sectionCard: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  sectionTitleSmall: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  ownerHint: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  ownerSaveBtn: { marginTop: spacing.sm, marginBottom: spacing.md },
  ownerGalRow: { gap: spacing.sm, paddingVertical: spacing.sm },
  ownerThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  addPhotoTile: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 2 },
  muted: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.sm },
  reviewItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { fontWeight: '800', color: colors.text },
  reviewBody: { marginTop: spacing.sm, fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  ownerReply: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
  },
  ownerReplyLabel: { fontSize: 11, fontWeight: '900', color: colors.primaryDark },
  ownerReplyText: { marginTop: 4, fontSize: 14, color: colors.text, lineHeight: 20 },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  replyInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  summary: {
    marginBottom: spacing.lg,
  },
  depositLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  depositValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
  },
  metaLine: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  payMmCard: {
    marginBottom: spacing.lg,
  },
  payMmHint: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  toggleChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  toggleChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  toggleTextActive: {
    color: colors.primaryDark,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timeTile: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tileOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  tileText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  tileTextOn: {
    color: colors.primaryDark,
  },
  confirm: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  confirmDisabled: {
    opacity: 0.85,
  },
  confirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pay: {
    marginTop: spacing.md,
  },
  done: {
    marginTop: spacing.md,
  },
});
