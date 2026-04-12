import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CategoryPill,
  HomeSearchModal,
  ProviderHeroCard,
  QuickActionTile,
  SearchBar,
  SectionHeader,
  defaultFilters,
  type HomeSearchFilters,
} from '../../components';
import { categories, quickServices, servicesForSelect } from '../../data/mockData';
import type { MainTabParamList, Provider } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { colors, radius, spacing } from '../../theme';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  navigation: BottomTabNavigationProp<MainTabParamList, 'Home'>;
  query: string;
  setQuery: (q: string) => void;
  onUseAi: () => void;
  providers: Provider[];
  loading: boolean;
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

const PLACEHOLDER_TINT = ['#D4DDE8', '#DCD6E4', '#D5E0DA', '#E5DFD4'] as const;

function exploreTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_TINT[h % PLACEHOLDER_TINT.length];
}

export function ClientManualBrowseHome({
  navigation,
  query,
  setQuery,
  onUseAi,
  providers,
  loading,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<HomeSearchFilters>(defaultFilters);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const quick = useMemo(
    () =>
      quickServices.map((s) => ({
        ...s,
        icon: s.id === 'wash' ? 'water-outline' : s.id === 'mechanic' ? 'construct-outline' : 'car-outline',
      })) as { id: string; name: string; icon: 'water-outline' | 'construct-outline' | 'car-outline' }[],
    [],
  );

  const filtered = useMemo(
    () => applyBrowseFilters(providers, query, appliedFilters),
    [providers, query, appliedFilters],
  );

  const explore = useMemo(() => providers.slice(0, 8), [providers]);

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

  return (
    <View style={styles.root}>
      <View style={styles.manualTopRow}>
        <Text style={styles.manualTitle}>Browse</Text>
        <Pressable onPress={onUseAi} hitSlop={8}>
          <Text style={styles.backToAi}>Use AI instead</Text>
        </Pressable>
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

      <SectionHeader title="Recently explored" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.exploreRow}
      >
        {explore.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => openBooking(p)}
            style={({ pressed }) => [styles.exploreCard, pressed && styles.exploreCardPressed]}
          >
            <View style={[styles.exploreImage, { backgroundColor: exploreTint(p.id) }]}>
              <View style={styles.exploreBadge}>
                <Text style={styles.exploreBadgeText}>Popular</Text>
              </View>
              <Ionicons name="car-sport-outline" size={40} color="rgba(24,24,27,0.2)" style={styles.exploreIcon} />
              <View style={styles.exploreOverlay}>
                <Text style={styles.exploreTitle} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.exploreMeta} numberOfLines={1}>
                  {p.specialty}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHeader title="Categories" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
        {categories.map((c) => (
          <CategoryPill
            key={c.id}
            item={c}
            onPress={() => navigateAppStack(navigation, 'SelectService', { categoryId: c.id })}
          />
        ))}
      </ScrollView>

      <SectionHeader title="Quick actions" />
      <View style={styles.quickRow}>
        {quick.map((q) => (
          <View key={q.id} style={styles.quickCell}>
            <QuickActionTile
              title={q.name}
              icon={q.icon}
              onPress={() => navigateAppStack(navigation, 'SelectService', { preselectServiceId: q.id })}
            />
          </View>
        ))}
      </View>

      <SectionHeader
        title="Popular near you"
        actionLabel="See all"
        onAction={() => navigateAppStack(navigation, 'ProviderList', { serviceName: 'All services' })}
      />
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <ProviderHeroCard
              provider={item}
              favorited={!!favorites[item.id]}
              onToggleFavorite={() =>
                setFavorites((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
              }
              onPress={() => openBooking(item)}
            />
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
    fontSize: 16,
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
  hRow: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  quickCell: {
    width: '50%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  exploreRow: {
    gap: spacing.md,
    paddingBottom: spacing.md,
    paddingRight: spacing.md,
  },
  exploreCard: {
    width: 168,
  },
  exploreCardPressed: {
    opacity: 0.92,
  },
  exploreImage: {
    height: 200,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
  },
  exploreBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    zIndex: 2,
  },
  exploreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text,
  },
  exploreIcon: {
    position: 'absolute',
    alignSelf: 'center',
    top: '36%',
  },
  exploreOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(24,24,27,0.5)',
  },
  exploreTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  exploreMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
  },
  loader: {
    marginVertical: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
