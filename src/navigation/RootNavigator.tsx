import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import { colors } from '../theme';
import { AppStackNavigator } from './AppStackNavigator';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PayGuestScreen } from '../screens/flow/PayGuestScreen';

function extractPaySlugFromUrl(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    if (parsed.path) {
      const p = String(parsed.path).replace(/^\//, '');
      if (p.startsWith('pay/')) return p.slice(4).split('/')[0]?.trim() || null;
    }
    if (parsed.hostname === 'pay' && parsed.path) {
      return String(parsed.path).replace(/^\//, '').split('/')[0]?.trim() || null;
    }
  } catch {
    /* ignore */
  }
  const m = url.match(/\/pay\/([^/?#]+)/i);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, authReady } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [paySlug, setPaySlug] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem('autexa:onboarding_seen_v1');
        if (!alive) return;
        setShowOnboarding(v !== '1');
      } catch {
        if (!alive) return;
        setShowOnboarding(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const open = (url: string | null) => {
      if (!url) return;
      const slug = extractPaySlugFromUrl(url);
      if (slug) setPaySlug(slug);
    };
    void Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => open(url));
    return () => sub.remove();
  }, [authReady]);

  if (!authReady || showOnboarding === null) {
    return (
      <SafeAreaView style={styles.boot} edges={['top', 'right', 'bottom', 'left']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {showOnboarding ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onDone={() => setShowOnboarding(false)} />}
          </Stack.Screen>
        ) : isAuthenticated ? (
          <Stack.Screen name="App" component={AppStackNavigator} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
      {paySlug ? (
        <View style={styles.payOverlay} pointerEvents="auto">
          <PayGuestScreen slug={paySlug} onClose={() => setPaySlug(null)} />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  payOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.background,
  },
});
