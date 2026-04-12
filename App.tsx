import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerPushToken } from './src/api/aiMarketplace';
import { isAutexaApiConfigured } from './src/config/env';
import { getFocusedRouteName } from './src/navigation/navigationState';
import { navigateToAppStack } from './src/navigation/navigateFromRoot';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { FloatingQuickHub } from './src/components/FloatingQuickHub';
import { rootNavigationRef } from './src/navigation/rootNavigationRef';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useUiStore } from './src/stores/uiStore';
import { colors, spacing } from './src/theme';
import { logSupabaseReachabilityInDev } from './src/utils/supabaseReachability';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function AppHooks() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('checkout-complete')) {
        Alert.alert('Payment', 'Thanks. If payment succeeded, your booking will show as paid shortly.');
      }
      if (url.includes('checkout-canceled')) {
        Alert.alert('Payment', 'Checkout was canceled.');
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !isAutexaApiConfigured()) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Autexa',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
          await Notifications.setNotificationChannelAsync('autexa-quick', {
            name: 'Autexa alerts',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            sound: 'default',
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const projectId =
          (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
        const tokenRes = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        if (!cancelled && tokenRes.data) {
          await registerPushToken(tokenRes.data, Platform.OS);
        }
      } catch (e) {
        if (__DEV__) {
          console.warn('[notifications]', e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const openFromPayload = (data: Record<string, unknown> | undefined) => {
      const open = data?.open;
      if (open === 'ai') navigateToAppStack('AiAssistant', undefined);
      else if (open === 'notifications') navigateToAppStack('Notifications', undefined);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromPayload(response.notification.request.content.data as Record<string, unknown> | undefined);
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  return null;
}

function GlobalNotice() {
  const message = useUiStore((s) => s.globalMessage);
  const setGlobalMessage = useUiStore((s) => s.setGlobalMessage);
  if (!message) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{message}</Text>
      <Pressable onPress={() => setGlobalMessage(null)} hitSlop={12}>
        <Text style={styles.noticeDismiss}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  useEffect(() => {
    void logSupabaseReachabilityInDev();
  }, []);

  useEffect(() => {
    void useUiStore.getState().hydrateAppMode();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider style={styles.root}>
        <AuthProvider>
          <AppHooks />
          <NavigationContainer
            ref={rootNavigationRef}
            theme={navTheme}
            onReady={() => {
              const s = rootNavigationRef.getRootState();
              useUiStore.getState().setNavFocusedLeafName(s ? getFocusedRouteName(s) : undefined);
            }}
            onStateChange={(state) => {
              useUiStore.getState().setNavFocusedLeafName(state ? getFocusedRouteName(state) : undefined);
            }}
          >
            <View style={styles.shellFill}>
              <View style={styles.appShell}>
                <GlobalNotice />
                <View style={styles.navMount}>
                  <RootNavigator />
                </View>
              </View>
              <FloatingQuickHub />
            </View>
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shellFill: {
    flex: 1,
  },
  appShell: {
    flex: 1,
  },
  navMount: {
    flex: 1,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  noticeText: {
    flex: 1,
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeDismiss: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
