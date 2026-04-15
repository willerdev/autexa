import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BrowseHomeSkeleton,
  HomeSearchModal,
  SearchBar,
  defaultFilters,
  type HomeSearchFilters,
} from '../../components';
import { servicesForSelect } from '../../data/mockData';
import type { MainTabParamList, Provider } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { colors, radius, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  navigation: BottomTabNavigationProp<MainTabParamList, keyof MainTabParamList>;
  query: string;
  setQuery: (q: string) => void;
  onUseAi: () => void;
  providers: Provider[];
  loading: boolean;
  /** When true, hides the AI shortcut — used on the Explore tab (manual provider browse only). */
  exploreMode?: boolean;
};

function matchesCategory(p: Provider, categoryId: string | null): boolean {
  if (!categoryId) return true;
  const want = servicesForSelect
    .filter((s) => s.categoryId === categoryId)
    .map((s) => s.name.toLowerCase());
  const spec = p.specialty.toLowerCase();
  return want.some((w) => spec.includes(w) || w.includes(spec));
}

function applyBrowseFilters(list: Provider[], q: string, f: HomeSearchFilters): Provider[] {
  let out = list;
  const qq = q.trim().toLowerCase();
  if (qq) {
    out = out.filter(
      (p) =>
        p.name.toLowerCase().includes(qq) ||
        p.specialty.toLowerCase().includes(qq) ||
        (p.location ?? '').toLowerCase().includes(qq),
    );
  }
  const loc = f.locationQuery.trim().toLowerCase();
  if (loc) {
    out = out.filter(
      (p) =>
        (p.location ?? '').toLowerCase().includes(loc) || p.name.toLowerCase().includes(loc),
    );
  }
  const maxD = parseFloat(f.maxPriceDollars.replace(',', '.'));
  if (Number.isFinite(maxD) && maxD > 0) {
    const maxC = Math.round(maxD * 100);
    out = out.filter((p) => p.basePriceCents == null || p.basePriceCents <= maxC);
  }
  const minR = f.minRating;
  if (minR != null) {
    out = out.filter((p) => p.rating >= minR);
  }
  out = out.filter((p) => matchesCategory(p, f.categoryId));
  return out;
}

const SERVICE_BADGE_BG = '#FF8A3D';

function tintForId(id: string): string {
  const tints = ['#DCE4EE', '#E5E0EB', '#E0E8E4', '#EEE8DC', '#E8E2DC'] as const;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return tints[h % tints.length];
}

function toServiceTypeTabs(providers: Provider[]): { id: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const p of providers) {
    const key = String(p.specialty || '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => ({ id: name, label: name }));
  return [{ id: 'all', label: 'All' }, ...sorted];
}

export function ClientManualBrowseHome({
  navigation,
  query,
  setQuery,
  onUseAi,
  providers,
  loading,
  exploreMode = false,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<HomeSearchFilters>(defaultFilters);
  const [activeTab, setActiveTab] = useState('all');

  const filtered = useMemo(
    () => applyBrowseFilters(providers, query, appliedFilters),
    [providers, query, appliedFilters],
  );

  const tabs = useMemo(() => toServiceTypeTabs(providers), [providers]);
  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return filtered;
    const q = activeTab.toLowerCase();
    return filtered.filter((p) => p.specialty.toLowerCase().includes(q) || q.includes(p.specialty.toLowerCase()));
  }, [filtered, activeTab]);

  const sortedPopular = useMemo(() => {
    return [...filteredByTab].sort((a, b) => b.rating - a.rating);
  }, [filteredByTab]);

  const chipDefs = [
    { id: 'location' as const, label: 'Location', on: appliedFilters.locationQuery.trim().length > 0 },
    { id: 'price' as const, label: 'Price', on: appliedFilters.maxPriceDollars.trim().length > 0 },
    { id: 'rating' as const, label: 'Rating', on: appliedFilters.minRating != null },
  ];

  const openBooking = (item: Provider) =>
    navigateAppStack(navigation, 'BookingConfirm', {
      providerId: item.id,
      providerName: item.name,
      serviceName: item.specialty,
    });

  const openBusiness = (item: Provider) =>
    navigateAppStack(navigation, 'BusinessDetail', {
      providerId: item.id,
    });

  return (
    <View style={styles.root}>
      <View style={styles.manualTopRow}>
        <Text style={styles.manualTitle}>{exploreMode ? 'Explore providers' : 'Most Popular Services'}</Text>
        {!exploreMode ? (
          <Pressable onPress={onUseAi} hitSlop={8}>
            <Text style={styles.backToAi}>Use AI instead</Text>
          </Pressable>
        ) : null}
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search services or providers…"
        onFilterPress={() => setModalOpen(true)}
        onSubmit={(text) => {
          const q = text.trim();
          if (!q) return;
          setQuery('');
          navigateAppStack(navigation, 'SelectService', { query: q });
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {chipDefs.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setModalOpen(true)}
            style={[styles.homeChip, c.on ? styles.homeChipOn : styles.homeChipOff]}
          >
            <Text style={[styles.homeChipText, c.on && styles.homeChipTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((t) => {
          const on = t.id === activeTab;
          return (
            <Pressable
              key={t.id}
              onPress={() => setActiveTab(t.id)}
              style={({ pressed }) => [styles.tab, on ? styles.tabOn : styles.tabOff, pressed && styles.tabPressed]}
            >
              <Text style={[styles.tabText, on ? styles.tabTextOn : styles.tabTextOff]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Explore</Text>
        <Pressable
          onPress={() =>
            navigateAppStack(navigation, 'ProviderList', {
              serviceName: activeTab === 'all' ? 'All services' : activeTab,
            })
          }
          hitSlop={8}
        >
          <Text style={styles.sectionAction}>See all</Text>
        </Pressable>
      </View>
      {loading ? (
        <BrowseHomeSkeleton />
      ) : (
        <FlatList
          data={sortedPopular}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: tintForId(item.id) }]}>
                    <Ionicons name="person-outline" size={26} color="rgba(24,24,27,0.25)" />
                  </View>
                )}
                <View style={styles.cardMain}>
                  <View style={styles.titleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {item.specialty}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardPrice} numberOfLines={1}>
                    {item.priceEstimate}
                  </Text>
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={14} color={colors.star} />
                    <Text style={styles.ratingText}>
                      {item.rating.toFixed(1)} ({item.reviewCount} reviews)
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => openBusiness(item)}
                  style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
                >
                  <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.outlineBtnText}>View Profile</Text>
                </Pressable>
                <Pressable
                  onPress={() => openBooking(item)}
                  style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
                >
                  <Ionicons name="calendar-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Book Now</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {providers.length === 0 ? 'No providers available yet.' : 'No providers match your filters.'}
            </Text>
          }
        />
      )}

      <HomeSearchModal
        visible={modalOpen}
        initial={appliedFilters}
        onClose={() => setModalOpen(false)}
        onApply={setAppliedFilters}
        onReset={() => setAppliedFilters(defaultFilters)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing.xs,
  },
  manualTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  backToAi: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  chipsRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
  },
  homeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  homeChipOff: {
    backgroundColor: colors.border,
  },
  homeChipOn: {
    backgroundColor: colors.text,
  },
  homeChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  homeChipTextOn: {
    color: colors.surface,
  },
  tabsRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingRight: spacing.md,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tabOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  tabPressed: {
    opacity: 0.92,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '800',
  },
  tabTextOn: {
    color: '#fff',
  },
  tabTextOff: {
    color: colors.textSecondary,
  },
  sectionRow: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sectionAction: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.border,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  badge: {
    maxWidth: 120,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: SERVICE_BADGE_BG,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
  },
  cardPrice: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  btnRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  outlineBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textSecondary,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.primary,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#fff',
  },
  btnPressed: {
    opacity: 0.92,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
