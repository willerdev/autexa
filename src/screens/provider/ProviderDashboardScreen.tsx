import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ensureProviderProfile } from '../../api/providerDashboard';
import { Card, PrimaryButton, ProviderDashboardSkeleton } from '../../components';
import type { MainTabParamList } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function ProviderDashboardScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await ensureProviderProfile();
        if (alive) setReady(true);
      } catch (e) {
        if (alive) Alert.alert('Provider', getErrorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Provider dashboard</Text>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{ready ? 'Ready' : 'Setting up…'}</Text>
        </View>
      </View>

      {!ready ? (
        <ProviderDashboardSkeleton />
      ) : (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Manage your marketplace</Text>
          <Text style={styles.cardSub}>Create categories, post services with AI descriptions, and manage bookings.</Text>
          <View style={styles.grid}>
            <Pressable style={styles.tile} onPress={() => navigateAppStack(navigation, 'ProviderCategories', undefined)}>
              <Ionicons name="pricetags-outline" size={22} color={colors.primary} />
              <Text style={styles.tileTitle}>Categories</Text>
              <Text style={styles.tileSub}>Create & organize</Text>
            </Pressable>
            <Pressable style={styles.tile} onPress={() => navigateAppStack(navigation, 'ProviderServices', undefined)}>
              <Ionicons name="briefcase-outline" size={22} color={colors.primary} />
              <Text style={styles.tileTitle}>Services</Text>
              <Text style={styles.tileSub}>Post offers</Text>
            </Pressable>
            <Pressable style={styles.tile} onPress={() => navigateAppStack(navigation, 'ProviderBookings', undefined)}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <Text style={styles.tileTitle}>Bookings</Text>
              <Text style={styles.tileSub}>See requests</Text>
            </Pressable>
            <Pressable style={styles.tile} onPress={() => navigateAppStack(navigation, 'AiAssistant', undefined)}>
              <Ionicons name="sparkles-outline" size={22} color={colors.primary} />
              <Text style={styles.tileTitle}>Ask Gearup</Text>
              <Text style={styles.tileSub}>Help writing posts</Text>
            </Pressable>
            <Pressable style={styles.tile} onPress={() => navigateAppStack(navigation, 'ProviderAddBusiness', undefined)}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.tileTitle}>Add business</Text>
              <Text style={styles.tileSub}>Unclaimed listing</Text>
            </Pressable>
          </View>
          <PrimaryButton
            title="Post a new service"
            onPress={() => navigateAppStack(navigation, 'ProviderServiceEdit', undefined)}
            style={styles.cta}
          />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  card: {
    paddingVertical: spacing.lg,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  cardSub: {
    marginTop: 6,
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
  },
  grid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: 6,
  },
  tileTitle: {
    fontWeight: '900',
    color: colors.text,
  },
  tileSub: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  cta: {
    marginTop: spacing.md,
  },
});

