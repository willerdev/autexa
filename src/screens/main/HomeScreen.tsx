import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Dimensions, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, PrimaryButton, ScreenScroll } from '../../components';
import { listAvailableProviders } from '../../api/providers';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from '../../api/profile';
import { useSessionStore } from '../../stores/sessionStore';
import type { MainTabParamList, Provider } from '../../types';
import { navigateAppStack } from '../../utils/navigation';
import { colors, radius, spacing } from '../../theme';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { getErrorMessage } from '../../lib/errors';
import { useUiStore } from '../../stores/uiStore';
import { ProviderDashboardScreen } from '../provider/ProviderDashboardScreen';
import { ClientManualBrowseHome } from './ClientManualBrowseHome';

export function HomeScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Home'>>();
  const { user } = useAuth();
  const profile = useSessionStore((s) => s.profile);
  const setGlobalMessage = useUiStore((s) => s.setGlobalMessage);
  const homeMode = useUiStore((s) => s.homeMode);
  const setHomeMode = useUiStore((s) => s.setHomeMode);
  const appMode = useUiStore((s) => s.appMode);
  const setAppMode = useUiStore((s) => s.setAppMode);
  const [aiPrompt, setAiPrompt] = useState('');
  const [query, setQuery] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await listAvailableProviders();
      if (error) {
        setGlobalMessage(getErrorMessage(error));
        setProviders([]);
      } else {
        setGlobalMessage(null);
        const list = Array.isArray(data) ? data : [];
        setProviders(list);
      }
    } catch (e) {
      setGlobalMessage(getErrorMessage(e));
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [setGlobalMessage]);

  useFocusEffect(
    useCallback(() => {
      if (homeMode === 'manual') {
        void loadProviders();
      }
    }, [homeMode, loadProviders]),
  );

  useEffect(() => {
    // When switching to manual mode without changing focus, fetch featured providers once.
    if (homeMode !== 'manual') return;
    if (providers.length) return;
    void loadProviders();
  }, [homeMode, providers.length, loadProviders]);

  const greetingName = user?.firstName ?? 'there';
  const isAdmin = (profile?.role ?? 'user') === 'admin';
  const isClientManualBrowse = appMode === 'client' && homeMode === 'manual';

  useEffect(() => {
    // Safety: if a non-admin previously toggled provider mode, force it back off.
    if (!isAdmin && appMode === 'provider') {
      setAppMode('client');
    }
  }, [isAdmin, appMode, setAppMode]);

  const toggleProvider = async () => {
    if (!isAdmin) return;
    if (!profile?.id) return;
    const next = appMode === 'provider' ? 'client' : 'provider';
    setAppMode(next);
    if (next === 'provider') {
      try {
        const { error } = await updateProfile(profile.id, { role: 'provider' });
        if (error) setGlobalMessage(getErrorMessage(error));
      } catch (e) {
        setGlobalMessage(getErrorMessage(e));
      }
    }
  };

  const openAi = () => {
    const seed = aiPrompt.trim();
    setAiPrompt('');
    navigateAppStack(navigation, 'AiAssistant', seed ? { seed } : undefined);
  };

  const W = Dimensions.get('window').width;
  const transition = useRef(new Animated.Value(1)).current;
  const prevModeRef = useRef<'client' | 'provider'>(appMode);
  const [renderMode, setRenderMode] = useState<'client' | 'provider'>(appMode);
  const [incomingMode, setIncomingMode] = useState<'client' | 'provider' | null>(null);

  useEffect(() => {
    const prev = prevModeRef.current;
    if (appMode === prev) return;
    prevModeRef.current = appMode;
    setIncomingMode(appMode);
    transition.setValue(0);
    Animated.timing(transition, { toValue: 1, duration: 340, useNativeDriver: true }).start(() => {
      setRenderMode(appMode);
      setIncomingMode(null);
    });
  }, [appMode, transition]);

  return (
    <ScreenScroll
      edges={['top', 'left', 'right']}
      contentContainerStyle={[styles.content, appMode === 'provider' ? styles.contentProvider : null]}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.greeting}>
            {isClientManualBrowse ? `Hey, ${greetingName}` : `Hello, ${greetingName}`}
          </Text>
          <Text style={styles.tagline}>
            {isClientManualBrowse
              ? 'Find trusted pros and book in a few taps.'
              : 'What can we help you with today?'}
          </Text>
        </View>
        <View style={styles.topRight}>
          {isClientManualBrowse ? (
            <Pressable
              style={({ pressed }) => [styles.bell, pressed && styles.bellPressed]}
              onPress={() => navigateAppStack(navigation, 'Notifications', undefined)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
              <View style={styles.bellDot} />
            </Pressable>
          ) : null}
          {isAdmin ? (
            <Pressable onPress={() => void toggleProvider()} style={styles.modePill} hitSlop={10}>
              <Text style={styles.modePillText}>{appMode === 'provider' ? 'Provider' : 'Client'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.modeStage}>
        <Animated.View
          style={[
            styles.modeLayer,
            incomingMode
              ? {
                  opacity: transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [
                    {
                      translateX: transition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -Math.min(48, W * 0.12)],
                      }),
                    },
                  ],
                }
              : null,
          ]}
        >
          {renderMode === 'provider' ? (
            <ProviderDashboardScreen />
          ) : homeMode === 'ai' ? (
            <Card style={styles.aiCard}>
              <Text style={styles.aiTitle}>Ask Gearup</Text>
              <Text style={styles.aiSub}>How can I help?</Text>
              <TextInput
                value={aiPrompt}
                onChangeText={setAiPrompt}
                placeholder="e.g. I need a mechanic, cheapest car wash…"
                placeholderTextColor={colors.textMuted}
                style={styles.aiInput}
                multiline
              />
              <PrimaryButton title="Ask Gearup" onPress={openAi} disabled={!aiPrompt.trim()} />
              <Pressable onPress={() => setHomeMode('manual')} style={styles.manualLink} hitSlop={8}>
                <Text style={styles.manualLinkText}>Browse services yourself</Text>
              </Pressable>
            </Card>
          ) : (
            <ClientManualBrowseHome
              navigation={navigation}
              query={query}
              setQuery={setQuery}
              onUseAi={() => setHomeMode('ai')}
              providers={providers}
              loading={loading}
            />
          )}
        </Animated.View>

        {incomingMode ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.tintOverlay,
                { opacity: transition.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
              ]}
            />
            <Animated.View
              style={[
                styles.modeLayer,
                {
                  opacity: transition,
                  transform: [
                    {
                      translateX: transition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [Math.min(56, W * 0.14), 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {incomingMode === 'provider' ? (
                <ProviderDashboardScreen />
              ) : homeMode === 'ai' ? (
                <Card style={styles.aiCard}>
                  <Text style={styles.aiTitle}>Ask Gearup</Text>
                  <Text style={styles.aiSub}>How can I help?</Text>
                  <TextInput
                    value={aiPrompt}
                    onChangeText={setAiPrompt}
                    placeholder="e.g. I need a mechanic, cheapest car wash…"
                    placeholderTextColor={colors.textMuted}
                    style={styles.aiInput}
                    multiline
                  />
                  <PrimaryButton title="Ask Gearup" onPress={openAi} disabled={!aiPrompt.trim()} />
                  <Pressable onPress={() => setHomeMode('manual')} style={styles.manualLink} hitSlop={8}>
                    <Text style={styles.manualLinkText}>Browse services yourself</Text>
                  </Pressable>
                </Card>
              ) : (
                <ClientManualBrowseHome
                  navigation={navigation}
                  query={query}
                  setQuery={setQuery}
                  onUseAi={() => setHomeMode('ai')}
                  providers={providers}
                  loading={loading}
                />
              )}
            </Animated.View>
          </>
        ) : null}
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  contentProvider: {
    backgroundColor: colors.primaryMuted,
  },
  modeStage: {
    position: 'relative',
  },
  modeLayer: {
    position: 'relative',
  },
  tintOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(23,94,163,0.06)',
    borderRadius: radius.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  topLeft: {
    flex: 1,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  bell: {
    padding: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bellPressed: {
    opacity: 0.85,
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.sm,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  modePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modePillText: {
    color: colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  aiCard: {
    paddingVertical: spacing.lg,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  aiSub: {
    marginTop: 4,
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  aiInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: 52,
    marginBottom: spacing.md,
  },
  manualLink: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  manualLinkText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
});
