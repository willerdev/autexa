import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../types';

/** Navigates to a screen on the parent app stack from inside bottom tabs. */
export function navigateAppStack<K extends keyof AppStackParamList>(
  navigation: NavigationProp<ParamListBase>,
  screen: K,
  params?: AppStackParamList[K],
) {
  const parent = navigation.getParent() as NativeStackNavigationProp<AppStackParamList> | undefined;
  // Typed navigate() has deep conditional overloads that do not infer well across generic K.
  (parent as { navigate: (n: string, p?: object) => void } | undefined)?.navigate(
    screen as string,
    params as object | undefined,
  );
}
