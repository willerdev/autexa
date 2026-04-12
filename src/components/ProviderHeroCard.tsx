import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Provider } from '../types';
import { colors, radius, spacing } from '../theme';

type Props = {
  provider: Provider;
  favorited: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
};

const PLACEHOLDER_BG = ['#DCE4EE', '#E5E0EB', '#E0E8E4', '#EEE8DC', '#E8E2DC'] as const;

function tintForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_BG[h % PLACEHOLDER_BG.length];
}

function areaLabel(p: Provider): string {
  const raw = (p.location ?? '').trim();
  if (!raw) return p.specialty;
  const parts = raw.split(/\s*[•·|]\s*/);
  const first = parts[0]?.trim();
  return first && first.length > 0 ? first : p.specialty;
}

function metaLine(p: Provider): string {
  const area = areaLabel(p);
  const d = p.distanceKm > 0 ? `${p.distanceKm.toFixed(1)} km away` : 'Nearby';
  return `${area} • ${d}`;
}

export function ProviderHeroCard({ provider, favorited, onToggleFavorite, onPress }: Props) {
  const tags = tagLabels(provider);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={[styles.imageWrap, { backgroundColor: tintForId(provider.id) }]}>
        <View style={styles.imageInner}>
          <Ionicons name="business" size={56} color="rgba(24,24,27,0.22)" />
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleFavorite();
          }}
          style={({ pressed }) => [styles.heartBtn, pressed && styles.heartBtnPressed]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={favorited ? 'Remove favorite' : 'Add favorite'}
        >
          <Ionicons name={favorited ? 'heart' : 'heart-outline'} size={20} color={favorited ? colors.danger : colors.text} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {provider.name}
        </Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={16} color={colors.star} />
          <Text style={styles.ratingText}>
            {provider.rating.toFixed(1)} ({provider.reviewCount})
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {metaLine(provider)}
        </Text>
        <View style={styles.tagsRow}>
          {tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function tagLabels(p: Provider): string[] {
  const out: string[] = [];
  if (p.specialty) out.push(p.specialty);
  const cents = p.basePriceCents;
  if (cents != null && cents < 8000) out.push('Great value');
  else if (cents != null) out.push('Premium');
  else out.push('Book now');
  return out.slice(0, 3);
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.96,
  },
  imageWrap: {
    height: 200,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  imageInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
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
  heartBtnPressed: {
    opacity: 0.85,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  meta: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
