import Mapbox from '@rnmapbox/maps';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { listAvailableProviders } from '../../api/providers';
import { env } from '../../config/env';
import type { Provider } from '../../types';
import { colors, spacing } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<AppStackParamList>;

function hasCoords(p: Provider): p is Provider & { lat: number; lng: number } {
  return typeof p.lat === 'number' && Number.isFinite(p.lat) && typeof p.lng === 'number' && Number.isFinite(p.lng);
}

export function MapScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [userCoord, setUserCoord] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const token = String(env.mapboxPublicToken || '').trim();
    if (!token) {
      Alert.alert('Map', 'Missing EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN (pk.*).');
      return;
    }
    if (!token.startsWith('pk.')) {
      Alert.alert('Map', 'Mapbox token must be a public token starting with pk. (Do not use sk.* in the app).');
      return;
    }
    Mapbox.setAccessToken(token);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Location', 'Location permission is needed to show your position on the map.');
        } else {
          const loc = await Location.getCurrentPositionAsync({});
          if (!cancelled) {
            setUserCoord({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          }
        }

        const { data, error } = await listAvailableProviders();
        if (error) throw error;
        if (!cancelled) setProviders(data);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Map', e instanceof Error ? e.message : 'Could not load providers.');
          setProviders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const pins = useMemo(() => providers.filter(hasCoords), [providers]);

  const initialCenter = userCoord
    ? [userCoord.lng, userCoord.lat]
    : pins.length
      ? [pins[0].lng, pins[0].lat]
      : [32.5825, 0.3476]; // Kampala fallback

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Street}>
        <Mapbox.Camera zoomLevel={12} centerCoordinate={initialCenter as [number, number]} />
        {userCoord ? <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" /> : null}

        {pins.map((p) => (
          <Mapbox.PointAnnotation
            key={p.id}
            id={p.id}
            coordinate={[p.lng, p.lat]}
            onSelected={() => navigation.navigate('BusinessDetail', { providerId: p.id })}
          >
            <View style={styles.pin}>
              <Text style={styles.pinText}>{String(p.name || '').slice(0, 1).toUpperCase()}</Text>
            </View>
          </Mapbox.PointAnnotation>
        ))}
      </Mapbox.MapView>

      {pins.length === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>No providers have map coordinates yet. Add lat/lng in Supabase to show them here.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  pinText: { color: '#fff', fontWeight: '900' },
  banner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: 'rgba(24,24,27,0.85)',
    borderRadius: 12,
    padding: spacing.md,
  },
  bannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

