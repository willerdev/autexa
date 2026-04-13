import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, ScreenScroll, TextField } from '../../components';
import { isSupabaseConfigured } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import type { AuthStackParamList } from '../../types';
import { colors, spacing } from '../../theme';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter email and password.');
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    try {
      await login(email.trim(), password);
      // RootNavigator switches to App when session is set — no navigate/replace here.
    } catch (e) {
      Alert.alert('Sign in failed', getErrorMessage(e));
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
        <Text style={styles.wordmark}>AUTEXA</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Continue with your account</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />
      </View>

      <PrimaryButton title="Sign in" onPress={onSubmit} style={styles.cta} loading={loading} disabled={loading} />

      <View style={styles.row}>
        <Text style={styles.muted}>New here? </Text>
        <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
          <Text style={styles.link}>Create account</Text>
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
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cta: {
    marginTop: spacing.md,
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
