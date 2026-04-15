import React, { useMemo, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  type StyleProp,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { useUiStore } from '../stores/uiStore';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  onScroll?: ScrollViewProps['onScroll'];
  scrollEventThrottle?: number;
  animated?: boolean;
  floatingChildren?: React.ReactNode;
};

export function ScreenScroll({
  children,
  style,
  contentContainerStyle,
  edges,
  onScroll,
  scrollEventThrottle,
  animated,
  floatingChildren,
}: Props) {
  const insets = useSafeAreaInsets();
  const setIsScrolling = useUiStore((s) => s.setIsScrolling);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgesList = edges ?? ['left', 'right'];
  const usesTop = edgesList.includes('top');
  const usesBottom = edgesList.includes('bottom');

  // Many Android emulators report top inset 0 while the status bar still draws over content.
  const androidStatusBarGap =
    usesTop && Platform.OS === 'android'
      ? Math.max(0, (StatusBar.currentHeight ?? 0) - insets.top)
      : 0;

  const scrollContentResolved = useMemo(() => {
    const flat = StyleSheet.flatten([styles.scrollContent, contentContainerStyle]) as ViewStyle;
    const baseTop = typeof flat.paddingTop === 'number' ? flat.paddingTop : spacing.sm;
    const baseBottom = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : spacing.xl;
    return [
      styles.scrollContent,
      contentContainerStyle,
      {
        paddingTop: baseTop + androidStatusBarGap,
        // Bottom safe area is applied by SafeAreaView; keep only content breathing room here.
        paddingBottom: baseBottom + (usesBottom ? spacing.md : 0),
      },
    ];
  }, [contentContainerStyle, androidStatusBarGap, usesBottom]);

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edgesList}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {animated ? (
          <Animated.ScrollView
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={scrollContentResolved}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={scrollEventThrottle ?? 16}
            onScrollBeginDrag={() => {
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              setIsScrolling(true);
            }}
            onMomentumScrollBegin={() => {
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              setIsScrolling(true);
            }}
            onScrollEndDrag={() => {
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              endTimerRef.current = setTimeout(() => setIsScrolling(false), 200);
            }}
            onMomentumScrollEnd={() => {
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              endTimerRef.current = setTimeout(() => setIsScrolling(false), 120);
            }}
          >
            {children}
          </Animated.ScrollView>
        ) : (
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={scrollContentResolved}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={scrollEventThrottle}
          onScrollBeginDrag={() => {
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
            setIsScrolling(true);
          }}
          onMomentumScrollBegin={() => {
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
            setIsScrolling(true);
          }}
          onScrollEndDrag={() => {
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
            endTimerRef.current = setTimeout(() => setIsScrolling(false), 200);
          }}
          onMomentumScrollEnd={() => {
            if (endTimerRef.current) clearTimeout(endTimerRef.current);
            endTimerRef.current = setTimeout(() => setIsScrolling(false), 120);
          }}
        >
          {children}
        </ScrollView>
        )}
      </KeyboardAvoidingView>
      {floatingChildren}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
});
