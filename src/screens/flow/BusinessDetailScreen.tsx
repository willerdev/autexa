import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchPublicProvider, resolveProviderServiceId, fetchPublicService } from '../../api/serviceDetail';
import { listProviderProducts, type ProviderProductRow } from '../../api/providerProducts';
import { supabase } from '../../lib/supabase';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { Card, ScreenScroll } from '../../components';
import { getErrorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<AppStackParamList, 'BusinessDetail'>;

function fmtPrice(cents: number): string {
  if (!Number.isFinite(Number(cents)) || cents <= 0) return 'Quote';
  return `$${(cents / 100).toFixed(0)}`;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Awaited<ReturnType<typeof fetchPublicProvider>>['data']>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [service, setService] = useState<Awaited<ReturnType<typeof fetchPublicService>>['data']>(null);
  const [products, setProducts] = useState<ProviderProductRow[]>([]);
  const [tab, setTab] = useState<'services' | 'info' | 'catering' | 'dropoff'>('services');

  const isProduct = Boolean(provider?.is_product_business);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const p = await fetchPublicProvider(providerId);
        if (cancelled) return;
        if (p.error) throw p.error;
        setProvider(p.data);

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

  const headerTitle = provider?.name ?? 'Business';

  useEffect(() => {
    navigation.setOptions({ title: headerTitle });
  }, [navigation, headerTitle]);

  const ratingLine = useMemo(() => {
    const r = Number(provider?.rating ?? 0);
    const reviewCount = Math.max(12, Math.round((Number.isFinite(r) ? r : 4.5) * 28));
    return `${(Number.isFinite(r) ? r : 4.5).toFixed(1)} (${reviewCount} reviews)`;
  }, [provider?.rating]);

  if (loading) {
    return (
      <ScreenScroll edges={['left', 'right']} contentContainerStyle={styles.center}>
        <ActivityIndicator color={colors.primary} />
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
      <ScreenScroll edges={['left', 'right']} contentContainerStyle={styles.wrap}>
        <Card style={styles.hero}>
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
          <Tab label="Catering" active={tab === 'catering'} onPress={() => setTab('catering')} />
          <Tab label="Drop off" active={tab === 'dropoff'} onPress={() => setTab('dropoff')} />
        </View>

        <View style={styles.listWrap}>
          {products.length === 0 ? (
            <Text style={styles.empty}>No products posted yet.</Text>
          ) : (
            products.map((p) => (
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
                <View style={styles.productThumb}>
                  <Ionicons name="image-outline" size={22} color="rgba(24,24,27,0.22)" />
                </View>
              </View>
            ))
          )}
        </View>
      </ScreenScroll>
    );
  }

  // Service business layout
  return (
    <ScreenScroll edges={['left', 'right']} contentContainerStyle={styles.wrap}>
      <Card style={styles.serviceHeader}>
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
  wrap: { paddingBottom: spacing.xxl },

  hero: { padding: spacing.lg },
  heroName: { fontSize: 20, fontWeight: '900', color: colors.text },
  heroMetaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroMeta: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  heroMetaSep: { fontSize: 12, color: colors.textMuted },

  serviceHeader: { padding: spacing.lg },
  serviceName: { fontSize: 20, fontWeight: '900', color: colors.text },
  serviceMetaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 8 },
  serviceMeta: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  serviceType: { marginTop: 6, fontSize: 13, fontWeight: '800', color: colors.primary },

  tabsLine: { marginTop: spacing.md, flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.md },
  tabBtn: { paddingVertical: spacing.sm },
  tabText: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  tabUnderline: { marginTop: 8, height: 2, borderRadius: 2 },
  tabUnderlineOn: { backgroundColor: colors.primary },
  tabUnderlineOff: { backgroundColor: 'transparent' },

  listWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  empty: { marginTop: spacing.md, color: colors.textMuted, textAlign: 'center' },

  productRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
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

