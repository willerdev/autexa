import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Image,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type Page = {
  key: string;
  title: string;
  subtitle: string;
  variant: 'logo' | 'ai' | 'services';
};

const { width: W } = Dimensions.get('window');

export function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const navigation = useNavigation();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const listRef = useRef<FlatList<Page>>(null);
  const [idx, setIdx] = useState(0);

  const pages = useMemo<Page[]>(
    () => [
      {
        key: 'logo',
        title: 'GEARUP',
        subtitle: 'Your AI-powered marketplace for car services.',
        variant: 'logo',
      },
      {
        key: 'ai',
        title: 'Ask Gearup',
        subtitle: 'Find the best provider, auto-book, reschedule, or cancel — right in chat.',
        variant: 'ai',
      },
      {
        key: 'services',
        title: 'Services in one place',
        subtitle: 'Mechanics, car wash, towing, tires, battery jump-start, and more.',
        variant: 'services',
      },
    ],
    [],
  );

  const active = pages[idx] ?? pages[0]!;

  const bg = useMemo(() => {
    if (active.variant === 'logo') return '#FFFFFF';
    return isDark ? '#070B12' : '#0B1220';
  }, [active.variant, isDark]);

  const cardBg = useMemo(() => {
    if (active.variant === 'logo') return 'transparent';
    return isDark ? '#0F172A' : '#0F172A';
  }, [active.variant, isDark]);

  const titleColor = useMemo(() => {
    if (active.variant === 'logo') return colors.primary;
    return '#F8FAFC';
  }, [active.variant]);

  const subtitleColor = useMemo(() => {
    if (active.variant === 'logo') return '#374151';
    return '#94A3B8';
  }, [active.variant]);

  const dotOn = active.variant === 'logo' ? colors.primary : '#F8FAFC';
  const dotOff = active.variant === 'logo' ? '#D1D5DB' : 'rgba(248,250,252,0.25)';

  const finish = async () => {
    try {
      await AsyncStorage.setItem('autexa:onboarding_seen_v1', '1');
    } catch {
      // best-effort
    }
    onDone?.();
    navigation.reset({ index: 0, routes: [{ name: 'Auth' as never }] });
  };

  const next = () => {
    if (idx >= pages.length - 1) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: idx + 1, animated: true });
    setIdx((v) => Math.min(pages.length - 1, v + 1));
  };

  const renderArt = (v: Page['variant']) => {
    if (v === 'logo') {
      return (
        <View style={styles.logoBlock}>
          <Image
            source={require('../../assets/images/icon.png')}
            style={styles.logoImage}
          />
          <Text style={[styles.logoText, { color: colors.primary }]}>GEARUP</Text>
        </View>
      );
    }
    if (v === 'ai') {
      return (
        <View style={styles.artWrap}>
          <View style={styles.blob} />
          <View style={styles.artRow}>
            <View style={styles.artIconCircle}>
              <Ionicons name="chatbubbles" size={28} color="#E0F2FE" />
            </View>
            <View style={styles.artIconCircle}>
              <Ionicons name="sparkles" size={28} color="#E0F2FE" />
            </View>
            <View style={styles.artIconCircle}>
              <Ionicons name="calendar" size={28} color="#E0F2FE" />
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.artWrap}>
        <View style={styles.blob} />
        <View style={styles.artRow}>
          <View style={styles.artIconCircle}>
            <Ionicons name="car-sport" size={28} color="#E0F2FE" />
          </View>
          <View style={styles.artIconCircle}>
            <Ionicons name="water" size={28} color="#E0F2FE" />
          </View>
          <View style={styles.artIconCircle}>
            <Ionicons name="construct" size={28} color="#E0F2FE" />
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.topRow}>
        <View />
        <Pressable onPress={() => void finish()} hitSlop={12}>
          <Text style={[styles.skip, { color: active.variant === 'logo' ? colors.primary : '#E5E7EB' }]}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(p) => p.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const nextIdx = Math.round(e.nativeEvent.contentOffset.x / W);
          setIdx(Math.max(0, Math.min(pages.length - 1, nextIdx)));
        }}
        renderItem={({ item }) => (
          <View style={[styles.page, { width: W }]}>
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              {renderArt(item.variant)}
              <Text style={[styles.title, { color: item.variant === 'logo' ? colors.primary : '#F8FAFC' }]}>
                {item.title}
              </Text>
              <Text style={[styles.subtitle, { color: item.variant === 'logo' ? '#4B5563' : '#94A3B8' }]}>
                {item.subtitle}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {pages.map((p, i) => {
            const on = i === idx;
            return (
              <View
                key={p.key}
                style={[
                  styles.dot,
                  { backgroundColor: on ? dotOn : dotOff, width: on ? 18 : 8, opacity: on ? 1 : 0.9 },
                ]}
              />
            );
          })}
        </View>

        <Pressable onPress={next} style={[styles.nextBtn, { backgroundColor: active.variant === 'logo' ? colors.primary : '#FFFFFF' }]}>
          <Ionicons
            name="arrow-forward"
            size={22}
            color={active.variant === 'logo' ? '#FFFFFF' : '#0B1220'}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    fontSize: 14,
    fontWeight: '800',
  },
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    minHeight: 520,
    justifyContent: 'center',
  },
  artWrap: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  blob: {
    position: 'absolute',
    width: 280,
    height: 200,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '-12deg' }],
  },
  artRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  artIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23,94,163,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(224,242,254,0.22)',
  },
  logoBlock: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 84,
    height: 84,
    borderRadius: 20,
    marginBottom: spacing.md,
  },
  logoText: {
    fontSize: 44,
    letterSpacing: 2,
    fontWeight: '900',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.95,
    paddingHorizontal: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 999,
  },
  nextBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 6,
      },
    }),
  },
});

