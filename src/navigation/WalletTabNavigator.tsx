import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { SavingsChallengeDetailScreen } from '../screens/flow/SavingsChallengeDetailScreen';
import { SavingsChallengesScreen } from '../screens/flow/SavingsChallengesScreen';
import { WalletPayeesScreen } from '../screens/flow/WalletPayeesScreen';
import { WalletPaymentLinksScreen } from '../screens/flow/WalletPaymentLinksScreen';
import { WalletScreen } from '../screens/flow/WalletScreen';
import { WalletTransactionsScreen } from '../screens/flow/WalletTransactionsScreen';
import { colors } from '../theme';

export type WalletTabStackParamList = {
  WalletHome: undefined;
  WalletTransactions: undefined;
  WalletPayees: undefined;
  WalletPaymentLinks: undefined;
  SavingsChallenges: undefined;
  SavingsChallengeDetail: { challengeId: string };
};

const Stack = createNativeStackNavigator<WalletTabStackParamList>();

export function WalletTabNavigator() {
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
      <Stack.Screen name="WalletHome" component={WalletScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WalletTransactions" component={WalletTransactionsScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="WalletPayees" component={WalletPayeesScreen} options={{ title: 'Saved payees' }} />
      <Stack.Screen name="WalletPaymentLinks" component={WalletPaymentLinksScreen} options={{ title: 'Payment links' }} />
      <Stack.Screen name="SavingsChallenges" component={SavingsChallengesScreen} options={{ title: 'Savings challenges' }} />
      <Stack.Screen name="SavingsChallengeDetail" component={SavingsChallengeDetailScreen} options={{ title: 'Challenge' }} />
    </Stack.Navigator>
  );
}

