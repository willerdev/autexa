import Mapbox from '@rnmapbox/maps';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listAvailableProviders } from '../../api/providers';
import { env } from '../../config/env';
import type { Provider } from '../../types';
import { colors, spacing } from '../../theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

/** Distinct from any provider UUID so PointAnnotation ids never collide. */
const ANDROID_USER_ANNOTATION_ID = '__autexa_user_location__';

type LocationPhase = 'checking' | 'requesting' | 'granted' | 'denied' | 'timeout';

function hasCoords(p: Provider): p is Provider & { lat: number; lng: number } {
  return typeof p.lat === 'number' && Number.isFinite(p.lat) && typeof p.lng === 'number' && Number.isFinite(p.lng);
}

const FALLBACK_CENTER: [number, number] = [32.5825, 0.3476]; // Kampala [lng, lat]
const GPS_TIMEOUT_MS = 14_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve('timeout'), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export function MapScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<{ key: string; name: 'Map'; params?: AppStackParamList['Map'] }>();
  const insets = useSafeAreaInsets();
  const mapReadyOnce = useRef(false);
  /** Avoid setState / native child mounts after leaving this stack screen (reduces freezes and ViewTagResolver races). */
  const screenFocusedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      return () => {
        screenFocusedRef.current = false;
      };
    }, []),
  );

  const mapboxToken = useMemo(() => String(env.mapboxPublicToken || '').trim(), []);
  const tokenError = useMemo<string | null>(() => {
    if (!mapboxToken) {
      return 'Missing Mapbox public token. Set EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN (pk.*) in EAS env and rebuild, or add it to .env for local builds.';
    }
    if (!mapboxToken.startsWith('pk.')) {
      return 'Mapbox token must be a public token starting with pk. Do not embed sk.* in the app.';
    }
    return null;
  }, [mapboxToken]);

  const [mapNativeReady, setMapNativeReady] = useState(false);
  const [annotationsReady, setAnnotationsReady] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [userCoord, setUserCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [locationPhase, setLocationPhase] = useState<LocationPhase>('checking');
  const [focusCoord, setFocusCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [focusProviderId, setFocusProviderId] = useState<string | null>(null);

  const markMapNativeReady = useCallback(() => {
    if (mapReadyOnce.current) return;
    mapReadyOnce.current = true;
    const reveal = () => {
      if (!screenFocusedRef.current) return;
      setMapNativeReady(true);
    };
    if (Platform.OS === 'android') {
      InteractionManager.runAfterInteractions(() => {
        setTimeout(reveal, 150);
      });
    } else {
      requestAnimationFrame(reveal);
    }
  }, []);

  useEffect(() => {
    if (!mapNativeReady) {
      setAnnotationsReady(false);
      return;
    }
    const t = setTimeout(() => {
      if (screenFocusedRef.current) setAnnotationsReady(true);
    }, Platform.OS === 'android' ? 220 : 80);
    return () => clearTimeout(t);
  }, [mapNativeReady]);

  useEffect(() => {
    if (tokenError) return;
    Mapbox.setAccessToken(mapboxToken);
  }, [mapboxToken, tokenError]);

  useEffect(() => {
    if (tokenError) return;
    let cancelled = false;

    const loadProviders = async () => {
      setProvidersLoading(true);
      try {
        const { data, error } = await listAvailableProviders();
        if (cancelled || !screenFocusedRef.current) return;
        if (error) throw error;
        setProviders(data);
      } catch (e) {
        if (!cancelled && screenFocusedRef.current) {
          Alert.alert('Map', e instanceof Error ? e.message : 'Could not load providers.');
          setProviders([]);
        }
      } finally {
        if (!cancelled && screenFocusedRef.current) setProvidersLoading(false);
      }
    };

    const loadLocation = async () => {
      try {
        setLocationPhase('checking');
        let { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled || !screenFocusedRef.current) return;

        if (status !== 'granted') {
          setLocationPhase('requesting');
          const req = await Location.requestForegroundPermissionsAsync();
          if (cancelled || !screenFocusedRef.current) return;
          status = req.status;
        }

        if (status !== 'granted') {
          if (screenFocusedRef.current) setLocationPhase('denied');
          return;
        }

        if (screenFocusedRef.current) setLocationPhase('granted');

        if (Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            /* optional; user may dismiss system dialog */
          }
        }

        if (!screenFocusedRef.current) return;

        const last = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
          requiredAccuracy: 5000,
        });
        let haveCoord = false;
        if (!cancelled && screenFocusedRef.current && last) {
          setUserCoord({ lat: last.coords.latitude, lng: last.coords.longitude });
          haveCoord = true;
        }

        const fixResult = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          GPS_TIMEOUT_MS,
        );

        if (cancelled || !screenFocusedRef.current) return;

        if (fixResult !== 'timeout') {
          setUserCoord({
            lat: fixResult.coords.latitude,
            lng: fixResult.coords.longitude,
          });
          return;
        }

        if (!haveCoord && screenFocusedRef.current) {
          setLocationPhase('timeout');
        }
      } catch {
        if (!cancelled && screenFocusedRef.current) {
          setLocationPhase((p) => (p === 'checking' || p === 'requesting' ? 'denied' : p));
        }
      }
    };

    void loadProviders();
    void loadLocation();

    return () => {
      cancelled = true;
    };
  }, [tokenError]);

  const pins = useMemo(() => providers.filter(hasCoords), [providers]);

  // React to navigation params (AI map_focus widget or manual deep links).
  useEffect(() => {
    const p = route?.params;
    const pid = typeof (p as any)?.providerId === 'string' ? String((p as any).providerId).trim() : '';
    const lat = typeof (p as any)?.lat === 'number' ? (p as any).lat : undefined;
    const lng = typeof (p as any)?.lng === 'number' ? (p as any).lng : undefined;
    if (pid) {
      setFocusProviderId(pid);
      const row = pins.find((x) => x.id === pid);
      if (row && hasCoords(row)) {
        setFocusCoord({ lat: row.lat, lng: row.lng });
      } else {
        setFocusCoord(null);
      }
      return;
    }
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      setFocusProviderId(null);
      setFocusCoord({ lat, lng });
      return;
    }
    setFocusProviderId(null);
    setFocusCoord(null);
  }, [route?.params, pins]);

  const centerCoordinate = useMemo((): [number, number] => {
    if (focusCoord) return [focusCoord.lng, focusCoord.lat];
    if (userCoord) return [userCoord.lng, userCoord.lat];
    if (pins.length) return [pins[0].lng, pins[0].lat];
    return FALLBACK_CENTER;
  }, [focusCoord, userCoord, pins]);

  const zoomLevel = focusCoord ? 15 : userCoord ? 15 : pins.length ? 12 : 11;

  const infoBanner = useMemo(() => {
    if (pins.length > 0 && (locationPhase !== 'timeout' || userCoord)) return null;
    if (userCoord) {
      return 'No other businesses on the map yet. Your position is shown — providers appear here once their map coordinates are added.';
    }
    if (locationPhase === 'timeout') {
      return 'Could not get a fresh GPS fix in time. Try moving outdoors or check that location is enabled for this app.';
    }
    if (locationPhase === 'denied') {
      return 'Location is off, so the map cannot center on you. Enable location in settings to see your position. No business pins yet.';
    }
    if (locationPhase === 'checking' || locationPhase === 'requesting') {
      return 'You can pan the map while we resolve location access.';
    }
    if (locationPhase === 'granted') {
      return 'Getting a GPS fix… You can pan the map. No business pins yet.';
    }
    return 'No businesses on the map yet. Enable location to center on you, or add provider coordinates in Supabase.';
  }, [pins.length, userCoord, locationPhase]);

  if (tokenError) {
    return (
      <View style={styles.tokenGate}>
        <Text style={styles.tokenTitle}>Map unavailable</Text>
        <Text style={styles.tokenBody}>{tokenError}</Text>
      </View>
    );
  }

  const cameraAnimates = Boolean(userCoord);
  const showTopPill =
    (locationPhase === 'checking' || locationPhase === 'requesting') && !userCoord
      ? 'permission'
      : locationPhase === 'granted' && !userCoord
        ? 'gps'
        : providersLoading
          ? 'providers'
          : null;

  const mapChildren = mapNativeReady ? (
    <>
      <Mapbox.Camera
        centerCoordinate={centerCoordinate}
        zoomLevel={zoomLevel}
        animationMode="flyTo"
        animationDuration={cameraAnimates ? 900 : 0}
        allowUpdates
      />

      {locationPhase === 'granted' && Platform.OS === 'ios' ? (
        <Mapbox.LocationPuck puckBearing="heading" puckBearingEnabled pulsing="default" />
      ) : null}

      {annotationsReady ? (
        <>
          {Platform.OS === 'android' && userCoord ? (
            <Mapbox.PointAnnotation id={ANDROID_USER_ANNOTATION_ID} coordinate={[userCoord.lng, userCoord.lat]}>
              <View style={styles.userDot}>
                <View style={styles.userDotInner} />
              </View>
            </Mapbox.PointAnnotation>
          ) : null}
          {pins.map((p) => (
            <Mapbox.PointAnnotation
              key={p.id}
              id={p.id}
              coordinate={[p.lng, p.lat]}
              onSelected={() => navigation.navigate('BusinessDetail', { providerId: p.id })}
            >
              <View style={[styles.pin, focusProviderId === p.id ? styles.pinFocused : null]}>
                <Text style={styles.pinText}>{String(p.name || '').slice(0, 1).toUpperCase()}</Text>
              </View>
            </Mapbox.PointAnnotation>
          ))}
          {focusCoord && !focusProviderId ? (
            <Mapbox.PointAnnotation id="__autexa_focus_coord__" coordinate={[focusCoord.lng, focusCoord.lat]}>
              <View style={styles.focusDot} />
            </Mapbox.PointAnnotation>
          ) : null}
        </>
      ) : null}
    </>
  ) : null;

  return (
    <View style={styles.root}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Street}
        surfaceView={false}
        onDidFinishLoadingMap={markMapNativeReady}
      >
        {mapChildren}
      </Mapbox.MapView>

      {showTopPill === 'permission' ? (
        <View style={[styles.pill, styles.pillTop]}>
          <Text style={styles.pillText}>
            {locationPhase === 'checking' ? 'Checking location access…' : 'Requesting location access…'}
          </Text>
        </View>
      ) : showTopPill === 'gps' ? (
        <View style={[styles.pill, styles.pillTop]}>
          <Text style={styles.pillText}>Getting GPS fix…</Text>
        </View>
      ) : showTopPill === 'providers' ? (
        <View style={[styles.pill, styles.pillTop]}>
          <Text style={styles.pillText}>Loading businesses…</Text>
        </View>
      ) : null}

      {infoBanner ? (
        <View style={[styles.banner, { bottom: Math.max(spacing.md, insets.bottom + spacing.sm) }]}>
          <Text style={styles.bannerText}>{infoBanner}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  tokenGate: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tokenTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  tokenBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinFocused: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 1.08 }],
  },
  pinText: { color: '#fff', fontWeight: '900' },
  focusDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryDark,
    borderWidth: 3,
    borderColor: '#fff',
  },
  userDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(23,94,163,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(24,24,27,0.88)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  pillTop: { top: spacing.md },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(24,24,27,0.85)',
    borderRadius: 12,
    padding: spacing.md,
  },
  bannerText: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 17 },
});
