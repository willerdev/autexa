import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { deleteMyCar, listMyCars, type CarRow } from '../../api/cars';
import { Card, MyCarsSkeleton, PrimaryButton, ScreenScroll } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

export function MyCarsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [cars, setCars] = useState<CarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await listMyCars();
      if (error) {
        Alert.alert('Cars', getErrorMessage(error));
        return;
      }
      setCars(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = (id: string) => {
    Alert.alert('Remove car', 'Delete this car from your garage?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              const r = await deleteMyCar(id);
              if (r.error) {
                Alert.alert('Remove car', getErrorMessage(r.error));
                return;
              }
              setCars((prev) => prev.filter((c) => c.id !== id));
            } catch (e) {
              Alert.alert('Remove car', getErrorMessage(e));
            }
          })();
        },
      },
    ]);
  };

  return (
    <ScreenScroll edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>My cars</Text>
        <Pressable onPress={() => void load()} hitSlop={10}>
          <Ionicons name="refresh" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {loading && cars.length === 0 ? (
        <MyCarsSkeleton />
      ) : cars.length ? (
        cars.map((car) => (
          <Card key={car.id} style={styles.carCard}>
            <View style={styles.carRow}>
              <View style={styles.carIcon}>
                <Ionicons name="car-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.carTitle}>
                  {car.year ? `${car.year} ` : ''}
                  {car.make} {car.model}
                </Text>
                {car.plate ? <Text style={styles.plate}>{car.plate}</Text> : null}
              </View>
              <Pressable
                onPress={() => navigation.navigate('AddCar', { carId: car.id })}
                hitSlop={10}
                style={styles.iconBtn}
              >
                <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(car.id)} hitSlop={10} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
            <View style={styles.quickRow}>
              <Pressable onPress={() => navigation.navigate('CarScan', { carId: car.id, mode: 'cluster' })} hitSlop={10}>
                <Text style={styles.quickLink}>Scan dashboard</Text>
              </Pressable>
              <Text style={styles.dot}>·</Text>
              <Pressable onPress={() => navigation.navigate('CarScan', { carId: car.id, mode: 'interior' })} hitSlop={10}>
                <Text style={styles.quickLink}>Scan interior</Text>
              </Pressable>
              <Text style={styles.dot}>·</Text>
              <Pressable onPress={() => navigation.navigate('CarScan', { carId: car.id, mode: 'exterior' })} hitSlop={10}>
                <Text style={styles.quickLink}>Scan exterior</Text>
              </Pressable>
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={styles.emptyTitle}>No cars yet</Text>
          <Text style={styles.emptySub}>Add a car so Gearup can suggest services and help diagnose issues.</Text>
        </Card>
      )}

      <PrimaryButton
        title={loading ? 'Loading…' : 'Add a car'}
        onPress={() => navigation.navigate('AddCar')}
        disabled={loading}
        style={styles.addBtn}
      />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
  },
  carCard: {
    marginBottom: spacing.sm,
  },
  carRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  flex: { flex: 1 },
  carTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  plate: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  iconBtn: {
    paddingLeft: spacing.sm,
    paddingVertical: 6,
  },
  quickRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickLink: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  dot: {
    marginHorizontal: 8,
    color: colors.textMuted,
    fontWeight: '900',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 6,
  },
  emptySub: {
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
  },
  addBtn: {
    marginTop: spacing.lg,
  },
});

