import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type UiState = {
  /** Deepest active route (e.g. `AiAssistant`) — for global UI like the floating hub. */
  navFocusedLeafName: string | undefined;
  setNavFocusedLeafName: (name: string | undefined) => void;
  globalMessage: string | null;
  setGlobalMessage: (message: string | null) => void;
  homeMode: 'ai' | 'manual';
  setHomeMode: (mode: 'ai' | 'manual') => void;
  appMode: 'client' | 'provider';
  setAppMode: (mode: 'client' | 'provider') => void;
  hydrateAppMode: () => Promise<void>;
};

export const useUiStore = create<UiState>((set) => ({
  navFocusedLeafName: undefined,
  setNavFocusedLeafName: (navFocusedLeafName) => set({ navFocusedLeafName }),
  globalMessage: null,
  setGlobalMessage: (globalMessage) => set({ globalMessage }),
  homeMode: 'ai',
  setHomeMode: (homeMode) => set({ homeMode }),
  appMode: 'client',
  setAppMode: (appMode) => {
    set({ appMode });
    void AsyncStorage.setItem('autexa:app_mode_v1', appMode);
  },
  hydrateAppMode: async () => {
    try {
      const v = await AsyncStorage.getItem('autexa:app_mode_v1');
      if (v === 'provider' || v === 'client') set({ appMode: v });
    } catch {
      // ignore
    }
  },
}));
