import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../types';
import { colors } from '../theme';
import { AppStackNavigator } from './AppStackNavigator';
import { AuthNavigator } from './AuthNavigator';
import { OnboardingScreen } from '../screens/OnboardingScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, authReady } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

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

  if (!authReady || showOnboarding === null) {
    return (
      <SafeAreaView style={styles.boot} edges={['top', 'right', 'bottom', 'left']}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
