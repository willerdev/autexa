import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AiAssistantScreen } from '../screens/flow/AiAssistantScreen';
import { BookingConfirmScreen } from '../screens/flow/BookingConfirmScreen';
import { DamageScanScreen } from '../screens/flow/DamageScanScreen';
import { NotificationsScreen } from '../screens/flow/NotificationsScreen';
import { AddCarScreen } from '../screens/flow/AddCarScreen';
import { CarScanScreen } from '../screens/flow/CarScanScreen';
import { MyCarsScreen } from '../screens/flow/MyCarsScreen';
import { ProviderListScreen } from '../screens/flow/ProviderListScreen';
import { RequestDetailsScreen } from '../screens/flow/RequestDetailsScreen';
import { SelectServiceScreen } from '../screens/flow/SelectServiceScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderCategoriesScreen } from '../screens/provider/ProviderCategoriesScreen';
import { ProviderServicesScreen } from '../screens/provider/ProviderServicesScreen';
import { ProviderServiceEditScreen } from '../screens/provider/ProviderServiceEditScreen';
import { ProviderBookingsScreen } from '../screens/provider/ProviderBookingsScreen';
import { ProviderAddBusinessScreen } from '../screens/provider/ProviderAddBusinessScreen';
import { BusinessDetailScreen } from '../screens/flow/BusinessDetailScreen';
import { MapScreen } from '../screens/main/MapScreen';
import { EditProfileScreen } from '../screens/flow/EditProfileScreen';
import { TwoFactorSettingsScreen } from '../screens/flow/TwoFactorSettingsScreen';
import { SubscriptionScreen } from '../screens/flow/SubscriptionScreen';
import { AddUnclaimedBusinessWizard } from '../screens/flow/AddUnclaimedBusinessWizard';
import { WalletScreen } from '../screens/flow/WalletScreen';
import { WalletPayeesScreen } from '../screens/flow/WalletPayeesScreen';
import { WalletPaymentLinksScreen } from '../screens/flow/WalletPaymentLinksScreen';
import { WalletSavingsScreen } from '../screens/flow/WalletSavingsScreen';
import { WalletTransfersScreen } from '../screens/flow/WalletTransfersScreen';
import { WalletTransactionsScreen } from '../screens/flow/WalletTransactionsScreen';
import { SavingsChallengesScreen } from '../screens/flow/SavingsChallengesScreen';
import { SavingsChallengeDetailScreen } from '../screens/flow/SavingsChallengeDetailScreen';
import type { AppStackParamList } from '../types';
import { colors } from '../theme';
import { MainTabNavigator } from './MainTabNavigator';

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="SelectService"
        component={SelectServiceScreen}
        options={{ title: 'Select service' }}
      />
      <Stack.Screen
        name="RequestDetails"
        component={RequestDetailsScreen}
        options={{ title: 'Request details' }}
      />
      <Stack.Screen
        name="ProviderList"
        component={ProviderListScreen}
        options={{ title: 'Choose provider' }}
      />
      <Stack.Screen
        name="BookingConfirm"
        component={BookingConfirmScreen}
        options={{ title: 'Service' }}
      />
      <Stack.Screen
        name="AiAssistant"
        component={AiAssistantScreen}
        options={{ title: 'Ask Gearup', headerShown: false }}
      />
      <Stack.Screen name="DamageScan" component={DamageScanScreen} options={{ title: 'Damage scan' }} />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: 'Notifications', headerShown: false }}
      />
      <Stack.Screen name="MyCars" component={MyCarsScreen} options={{ title: 'My cars' }} />
      <Stack.Screen name="AddCar" component={AddCarScreen} options={{ title: 'Add car' }} />
      <Stack.Screen name="CarScan" component={CarScanScreen} options={{ title: 'Car scan' }} />
      <Stack.Screen name="ProviderDashboard" component={ProviderDashboardScreen} options={{ title: 'Provider' }} />
      <Stack.Screen name="ProviderCategories" component={ProviderCategoriesScreen} options={{ title: 'Categories' }} />
      <Stack.Screen name="ProviderServices" component={ProviderServicesScreen} options={{ title: 'Services' }} />
      <Stack.Screen name="ProviderServiceEdit" component={ProviderServiceEditScreen} options={{ title: 'Edit service' }} />
      <Stack.Screen name="ProviderBookings" component={ProviderBookingsScreen} options={{ title: 'Bookings' }} />
      <Stack.Screen name="ProviderAddBusiness" component={ProviderAddBusinessScreen} options={{ title: 'Add business' }} />
      <Stack.Screen name="AddUnclaimedBusiness" component={AddUnclaimedBusinessWizard} options={{ title: 'Add business' }} />
      <Stack.Screen name="BusinessDetail" component={BusinessDetailScreen} options={{ title: 'Business' }} />
      <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit profile' }} />
      <Stack.Screen name="TwoFactorSettings" component={TwoFactorSettingsScreen} options={{ title: 'Two‑factor' }} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: 'Subscription' }} />
      <Stack.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
      <Stack.Screen name="WalletTransactions" component={WalletTransactionsScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="WalletPayees" component={WalletPayeesScreen} options={{ title: 'Saved payees' }} />
      <Stack.Screen name="WalletPaymentLinks" component={WalletPaymentLinksScreen} options={{ title: 'Payment links' }} />
      <Stack.Screen name="WalletSavings" component={WalletSavingsScreen} options={{ title: 'Savings' }} />
      <Stack.Screen name="WalletTransfers" component={WalletTransfersScreen} options={{ title: 'Transfers' }} />
      <Stack.Screen name="SavingsChallenges" component={SavingsChallengesScreen} options={{ title: 'Savings challenges' }} />
      <Stack.Screen
        name="SavingsChallengeDetail"
        component={SavingsChallengeDetailScreen}
        options={{ title: 'Challenge' }}
      />
    </Stack.Navigator>
  );
}
