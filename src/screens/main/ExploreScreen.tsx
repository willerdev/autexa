import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ClientManualBrowseHome } from './ClientManualBrowseHome';
import { listAvailableProviders } from '../../api/providers';
import { Ionicons } from '@expo/vector-icons';
import { ScreenScroll } from '../../components';
import type { MainTabParamList, Provider } from '../../types';
import { getErrorMessage } from '../../lib/errors';
import { useUiStore } from '../../stores/uiStore';
import { navigateToAppStack } from '../../navigation/navigateFromRoot';
import { colors, spacing } from '../../theme';

export function ExploreScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList, 'Explore'>>();
  const setGlobalMessage = useUiStore((s) => s.setGlobalMessage);
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
        setProviders(Array.isArray(data) ? data : []);
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
      void loadProviders();
    }, [loadProviders]),
  );

  return (
    <ScreenScroll edges={['top', 'left', 'right']} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.topBar}>
        <Pressable style={styles.addBtn} onPress={() => navigateToAppStack('AddUnclaimedBusiness', undefined)}>
          <Ionicons name="add-circle-outline" size={18} color={colors.primaryDark} />
          <Text style={styles.addText}>Add business</Text>
        </Pressable>
      </View>
      <ClientManualBrowseHome
        navigation={navigation}
        query={query}
        setQuery={setQuery}
        onUseAi={() => {}}
        providers={providers}
        loading={loading}
        exploreMode
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addText: { fontWeight: '900', color: colors.primaryDark },
});
