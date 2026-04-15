import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type BlockProps = {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: object;
};

export function SkeletonBlock({ width = '100%', height, borderRadius = radius.sm, style }: BlockProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.92, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function BrowseHomeSkeleton() {
  return (
    <View style={styles.browseRoot} accessibilityLabel="Loading">
      <View style={styles.browseTop}>
        <SkeletonBlock width="55%" height={20} borderRadius={6} />
        <SkeletonBlock width={28} height={14} borderRadius={4} />
      </View>
      <SkeletonBlock height={48} borderRadius={radius.md} />
      <View style={styles.chips}>
        <SkeletonBlock width={72} height={32} borderRadius={999} />
        <SkeletonBlock width={64} height={32} borderRadius={999} />
        <SkeletonBlock width={80} height={32} borderRadius={999} />
      </View>
      <View style={styles.tabs}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} width={56 + (i % 3) * 12} height={36} borderRadius={999} />
        ))}
      </View>
      <View style={styles.sectionRow}>
        <SkeletonBlock width={100} height={18} borderRadius={6} />
        <SkeletonBlock width={52} height={16} borderRadius={6} />
      </View>
      <View style={styles.cardsRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.cardStub}>
            <SkeletonBlock width="100%" height={112} borderRadius={radius.md} />
            <SkeletonBlock width="70%" height={14} borderRadius={4} style={{ marginTop: spacing.sm }} />
            <SkeletonBlock width="40%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function WalletHomeSkeleton() {
  return (
    <View style={styles.walletRoot} accessibilityLabel="Loading wallet">
      <SkeletonBlock width={120} height={22} borderRadius={6} style={{ marginBottom: spacing.md }} />
      <View style={styles.walletHero}>
        <SkeletonBlock width={64} height={12} borderRadius={4} />
        <SkeletonBlock width="72%" height={36} borderRadius={8} style={{ marginTop: spacing.sm }} />
        <SkeletonBlock width="48%" height={14} borderRadius={4} style={{ marginTop: spacing.sm }} />
      </View>
      <View style={styles.iconRow}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} width={56} height={56} borderRadius={28} />
        ))}
      </View>
      <SkeletonBlock width={140} height={16} borderRadius={4} style={{ marginTop: spacing.lg, marginBottom: spacing.sm }} />
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.txRow}>
          <SkeletonBlock width={44} height={44} borderRadius={22} />
          <View style={styles.txText}>
            <SkeletonBlock width="55%" height={14} borderRadius={4} />
            <SkeletonBlock width="35%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          <SkeletonBlock width={56} height={16} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export function BookingsListSkeleton() {
  return (
    <View accessibilityLabel="Loading bookings">
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.bookingCard}>
          <View style={styles.bookingRow}>
            <SkeletonBlock width={10} height={10} borderRadius={5} />
            <View style={styles.bookingMain}>
              <SkeletonBlock width="70%" height={16} borderRadius={4} />
              <SkeletonBlock width="45%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
              <SkeletonBlock width="55%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
            </View>
            <SkeletonBlock width={72} height={26} borderRadius={radius.md} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MyCarsSkeleton() {
  return (
    <View accessibilityLabel="Loading cars">
      {[1, 2].map((i) => (
        <View key={i} style={styles.carCard}>
          <View style={styles.carRow}>
            <SkeletonBlock width={40} height={40} borderRadius={20} />
            <View style={styles.carMain}>
              <SkeletonBlock width="75%" height={18} borderRadius={4} />
              <SkeletonBlock width="40%" height={13} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProviderDashboardSkeleton() {
  return (
    <View style={styles.providerRoot} accessibilityLabel="Loading provider dashboard">
      <SkeletonBlock width="100%" height={120} borderRadius={radius.lg} />
      <View style={styles.providerGrid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.providerCell}>
            <SkeletonBlock width="100%" height={88} borderRadius={radius.md} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function AiAssistantSkeleton() {
  return (
    <View style={styles.aiRoot} accessibilityLabel="Loading assistant">
      <SkeletonBlock width="45%" height={18} borderRadius={6} />
      <View style={styles.aiBubbleRow}>
        <SkeletonBlock width="78%" height={54} borderRadius={radius.lg} />
      </View>
      <View style={styles.aiBubbleRowRight}>
        <SkeletonBlock width="58%" height={44} borderRadius={radius.lg} />
      </View>
      <View style={styles.aiBubbleRow}>
        <SkeletonBlock width="72%" height={50} borderRadius={radius.lg} />
      </View>
      <SkeletonBlock width="100%" height={44} borderRadius={radius.lg} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  browseRoot: { gap: spacing.md },
  browseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', gap: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  cardsRow: { flexDirection: 'row', gap: spacing.md, paddingRight: spacing.md },
  cardStub: { width: 200 },
  walletRoot: { marginTop: spacing.xs },
  walletHero: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  txText: { flex: 1, gap: 0 },
  bookingCard: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  bookingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bookingMain: { flex: 1 },
  carCard: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  carRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  carMain: { flex: 1 },
  providerRoot: { gap: spacing.md, paddingTop: spacing.sm },
  providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  providerCell: { width: '47%', flexGrow: 1, minWidth: 140 },
  aiRoot: { gap: spacing.md, paddingTop: spacing.sm },
  aiBubbleRow: { alignItems: 'flex-start' },
  aiBubbleRowRight: { alignItems: 'flex-end' },
});
