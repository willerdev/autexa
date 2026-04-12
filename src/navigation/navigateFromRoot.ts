import { CommonActions } from '@react-navigation/native';
import type { AppStackParamList } from '../types';
import { rootNavigationRef } from './rootNavigationRef';

/** Navigate to a screen on the in-app stack (user must be on root route `App`). */
export function navigateToAppStack<K extends keyof AppStackParamList>(
  screen: K,
  params?: AppStackParamList[K],
): boolean {
  if (!rootNavigationRef.isReady()) return false;
  rootNavigationRef.dispatch(
    CommonActions.navigate({
      name: 'App',
      params: { screen, params },
    } as never),
  );
  return true;
}
