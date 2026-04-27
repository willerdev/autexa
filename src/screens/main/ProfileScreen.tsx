import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { fetchMyReferralCode } from '../../api/referrals';
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
  const isAdmin = (profile?.role ?? 'user') === 'admin';
  const [refCode, setRefCode] = useState<string>('');
  const [refCodeError, setRefCodeError] = useState<string>('');

  const loadRefCode = useCallback(async () => {
    try {
      setRefCodeError('');
      const { code } = await fetchMyReferralCode();
      setRefCode(String(code ?? '').trim());
    } catch (e) {
      setRefCode('');
      setRefCodeError('Could not load your referral code. Tap refresh to retry.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        if (!alive) return;
        await loadRefCode();
      })();
      return () => {
        alive = false;
      };
    }, [loadRefCode]),
  );

  const shareReferral = async () => {
    const code = refCode.trim();
    if (!code) return;
    const message = `Join Gearup with my referral code: ${code}`;
    try {
      await Share.share({ message });
    } catch {
      /* ignore */
    }
  };

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

      <Text style={styles.section}>Places</Text>
      <Card>
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'Map', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="map-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Map</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </Card>

      <Text style={styles.section}>Referral</Text>
      <Card>
        <View style={styles.refRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Your referral code</Text>
            <Text style={styles.refCode}>{refCode || '—'}</Text>
            <Text style={styles.refHint}>Earn 500 UGX when a referred user becomes active.</Text>
            {refCodeError ? <Text style={styles.refError}>{refCodeError}</Text> : null}
          </View>
          <Pressable style={styles.refAction} onPress={() => void loadRefCode()}>
            <Ionicons name="refresh-outline" size={18} color={colors.primaryDark} />
          </Pressable>
          <Pressable
            style={styles.refAction}
            onPress={async () => {
              if (!refCode.trim()) return;
              await Clipboard.setStringAsync(refCode.trim());
              Alert.alert('Copied', 'Referral code copied.');
            }}
          >
            <Ionicons name="copy-outline" size={18} color={colors.primaryDark} />
          </Pressable>
          <Pressable style={styles.refAction} onPress={shareReferral} disabled={!refCode.trim()}>
            <Ionicons name="share-social-outline" size={18} color={colors.primaryDark} />
          </Pressable>
        </View>
      </Card>

      <Text style={styles.section}>Settings</Text>
      <Card>
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'EditProfile', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="create-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'MyCars', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="car-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>My cars</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'Subscription', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="ribbon-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Subscription</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.settingRow} onPress={() => navigateAppStack(navigation, 'TwoFactorSettings', undefined)}>
          <View style={styles.settingIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
          </View>
          <Text style={styles.settingLabel}>Two‑factor authentication</Text>
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
          onPress={() => Alert.alert('Payments', 'Payment methods are configured automatically.')}
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

      {isAdmin && isProvider ? (
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
  refRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  refCode: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.text,
  },
  refHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  refError: {
    marginTop: 6,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 16,
    fontWeight: '800',
  },
  refAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(23,94,163,0.2)',
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
