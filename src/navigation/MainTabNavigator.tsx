import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookingsScreen } from '../screens/main/BookingsScreen';
import { HomeScreen } from '../screens/main/HomeScreen';
import { MapScreen } from '../screens/main/MapScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { MyCarsScreen } from '../screens/flow/MyCarsScreen';
import { ProviderServicesScreen } from '../screens/provider/ProviderServicesScreen';
import type { MainTabParamList } from '../types';
import { colors } from '../theme';
import { useUiStore } from '../stores/uiStore';
import { WalletTabNavigator } from './WalletTabNavigator';

const Tab = createBottomTabNavigator<MainTabParamList>();

const iconFor: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Map: 'map-outline',
  Bookings: 'calendar-outline',
  MyCars: 'car-outline',
  ProviderServicesTab: 'briefcase-outline',
  Wallet: 'wallet-outline',
  Profile: 'person-outline',
};

export function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const appMode = useUiStore((s) => s.appMode);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
        tabBarStyle: {
          backgroundColor: colors.primary,
          borderTopColor: 'rgba(255,255,255,0.18)',
          paddingTop: 8,
          paddingBottom: bottomPad,
          minHeight: 52 + 8 + bottomPad,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={iconFor[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <Tab.Screen
        name="Bookings"
        component={BookingsScreen}
        options={{
          title: appMode === 'provider' ? 'Bookings' : 'Recent activities',
          tabBarLabel: appMode === 'provider' ? 'Bookings' : 'Recent activities',
        }}
      />
      {appMode === 'provider' ? (
        <Tab.Screen name="ProviderServicesTab" component={ProviderServicesScreen} options={{ title: 'Services' }} />
      ) : (
        <Tab.Screen name="MyCars" component={MyCarsScreen} options={{ title: 'My cars' }} />
      )}
      <Tab.Screen name="Wallet" component={WalletTabNavigator} options={{ title: 'Wallet' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
