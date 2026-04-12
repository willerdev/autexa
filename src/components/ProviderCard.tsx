import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Provider } from '../types';
import { Card } from './Card';
import { colors, spacing } from '../theme';

type Props = {
  provider: Provider;
  onPress?: () => void;
  selected?: boolean;
};

export function ProviderCard({ provider, onPress, selected }: Props) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card
        style={[
          styles.card,
          selected && { borderWidth: 2, borderColor: colors.primary, shadowOpacity: 0.12 },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="business-outline" size={24} color={colors.primary} />
          </View>
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>{provider.name}</Text>
              {provider.aiRecommended ? (
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={12} color={colors.primaryDark} />
                  <Text style={styles.aiBadgeText}>Autexa pick</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.sub}>{provider.specialty}</Text>
            {provider.aiReason && provider.aiRecommended ? (
              <Text style={styles.aiReason} numberOfLines={2}>
                {provider.aiReason}
              </Text>
            ) : null}
            <View style={styles.meta}>
              <Ionicons name="star" size={14} color={colors.star} />
              <Text style={styles.rating}>
                {provider.rating}{' '}
                <Text style={styles.muted}>({provider.reviewCount})</Text>
              </Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.muted}>{provider.distanceKm} km</Text>
            </View>
          </View>
          <Text style={styles.price}>{provider.priceEstimate}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  main: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  aiReason: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  sub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: 4,
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  dot: {
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
});
