import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useSessionStore } from '../../stores/sessionStore';
import { useUiStore } from '../../stores/uiStore';
import type { MainTabParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { navigateAppStack } from '../../utils/navigation';

export function ProfileScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Profile'>>();
  const { user, logout } = useAuth();
  const profile = useSessionStore((s) => s.profile);
  const appMode = useUiStore((s) => s.appMode);
  const isProvider = appMode === 'provider';

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Profile</Text>
      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>{(user?.firstName ?? '?').charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.firstName ?? '—'}</Text>
        <Text style={styles.email}>{user?.email ?? '—'}</Text>
        {user?.phone ? <Text style={styles.phone}>{user.phone}</Text> : null}
        {profile?.role && profile.role !== 'user' ? (
          <View style={styles.rolePill}>
            <Text style={styles.roleText}>Role: {profile.role}</Text>
          </View>
        ) : null}
      </Card>

      <Text style={styles.section}>Wallet & savings</Text>
      <Card>
        <Pressable style={styles.settingRow} onPress={() => navigation.navigate('Wallet')}>
          <View style={styles.settingIcon}>
            <Ionicons name="wallet-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Wallet overview</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() => navigateAppStack(navigation, 'WalletTransactions', undefined)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="receipt-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Transaction history</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'WalletPayees', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="people-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Saved payees</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() => navigateAppStack(navigation, 'WalletPaymentLinks', undefined)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="link-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Payment links</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'WalletSavings', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="archive-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Savings</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() => navigateAppStack(navigation, 'WalletTransfers', undefined)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="swap-horizontal-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Transfers</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() => navigateAppStack(navigation, 'SavingsChallenges', undefined)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="trophy-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Savings challenges</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>

      <Text style={styles.section}>Settings</Text>
      <Card>
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'MyCars', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="car-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>My cars</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() => navigateAppStack(navigation, 'Notifications', undefined)}
        >
          <View style={styles.settingIcon}>
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Notifications</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          style={styles.settingRow}
          onPress={() =>
            Alert.alert(
              'Payments',
              'Wallet and booking deposits use Flutterwave v4 (Uganda mobile money on your phone). Configure FLUTTERWAVE_CLIENT_ID, FLUTTERWAVE_CLIENT_SECRET, and FLUTTERWAVE_SANDBOX in server/.env.',
            )
          }
        >
          <View style={styles.settingIcon}>
            <Ionicons name="card-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Payment methods</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => Alert.alert('Help', 'UI only — no backend yet.')}>
          <View style={styles.settingIcon}>
            <Ionicons name="help-circle-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Help & support</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>

      {isProvider ? (
        <>
          <Text style={styles.section}>Provider</Text>
          <Card>
            <Pressable
              style={styles.settingRow}
              onPress={() => navigateAppStack(navigation, 'ProviderServices', undefined)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="briefcase-outline" size={22} color={colors.text} />
              </View>
              <Text style={styles.settingLabel}>My services</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.settingRow}
              onPress={() => navigateAppStack(navigation, 'ProviderBookings', undefined)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="calendar-outline" size={22} color={colors.text} />
              </View>
              <Text style={styles.settingLabel}>Provider bookings</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.settingRow}
              onPress={() => navigateAppStack(navigation, 'ProviderCategories', undefined)}
            >
              <View style={styles.settingIcon}>
                <Ionicons name="pricetags-outline" size={22} color={colors.text} />
              </View>
              <Text style={styles.settingLabel}>Service categories</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.settingRow}
              onPress={() =>
                Alert.alert(
                  'Provider payments',
                  'Provider payouts can be wired through Flutterwave transfers or a separate payout flow — configure in the server when ready.',
                )
              }
            >
              <View style={styles.settingIcon}>
                <Ionicons name="cash-outline" size={22} color={colors.text} />
              </View>
              <Text style={styles.settingLabel}>Provider payments</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          </Card>
        </>
      ) : null}

      <PrimaryButton title="Sign out" variant="outline" onPress={logout} style={styles.signOut} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarLetter: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  phone: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  rolePill: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
  },
  roleText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'capitalize',
  },
  section: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  settingIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  signOut: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
});
