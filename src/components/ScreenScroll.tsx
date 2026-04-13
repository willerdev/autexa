import React, { useMemo } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
};

export function ScreenScroll({ children, style, contentContainerStyle, edges }: Props) {
  const insets = useSafeAreaInsets();
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
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={scrollContentResolved}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
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
