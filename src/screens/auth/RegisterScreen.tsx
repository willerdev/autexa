import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isSupabaseConfigured } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import type { AuthStackParamList } from '../../types';
import { colors, spacing } from '../../theme';

export function RegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);

  const onSubmit = async () => {
    if (submitLockRef.current || loading) {
      return;
    }
    if (!isSupabaseConfigured()) {
      Alert.alert(
        'Configuration',
        'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file (see .env.example), then restart Expo.',
      );
      return;
    }
    if (!firstName.trim() || !email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter name, email, and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Use at least 6 characters.');
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    try {
      await register(firstName.trim(), email.trim(), password, phone.trim() || undefined);
      const rc = referralCode.trim();
      if (rc) {
        await AsyncStorage.setItem('autexa:pending_referral_code', rc);
      }
      Alert.alert(
        'Check your inbox',
        'If email confirmation is enabled in Supabase, confirm your email before signing in.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch (e) {
      Alert.alert('Sign up failed', getErrorMessage(e));
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  return (
    <ScreenScroll contentContainerStyle={styles.content} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.centerBlock}>
        <Image
          source={require('../../../assets/images/icon.png')}
          style={styles.brandIcon}
        />
        <Text style={styles.wordmark}>GEARUP</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Book trusted car services in minutes.</Text>
      </View>

      <View style={styles.form}>
        <TextField label="First name" value={firstName} onChangeText={setFirstName} autoComplete="name" />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password-new"
        />
        <TextField
          label="Referral code (optional)"
          value={referralCode}
          onChangeText={setReferralCode}
          autoCapitalize="characters"
        />
      </View>

      <PrimaryButton title="Sign up" onPress={onSubmit} loading={loading} disabled={loading} />

      <View style={styles.row}>
        <Text style={styles.muted}>Already have an account? </Text>
        <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  centerBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  form: {
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  link: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
});
