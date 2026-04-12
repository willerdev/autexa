import type { NavigationState } from '@react-navigation/native';

/** Deepest focused route name (e.g. `AiAssistant`, `Home`). */
export function getFocusedRouteName(state: NavigationState | undefined): string | undefined {
  if (!state?.routes?.length) return undefined;
  const index = state.index ?? 0;
  const route = state.routes[index];
  if (!route) return undefined;
  if (route.state != null) {
    return getFocusedRouteName(route.state as NavigationState);
  }
  return route.name;
}
