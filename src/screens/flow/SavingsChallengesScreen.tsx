import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SavingsChallenge } from '../../api/savingsChallenges';
import { listSavingsChallenges } from '../../api/savingsChallenges';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function SavingsChallengesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [rows, setRows] = useState<SavingsChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const r = await listSavingsChallenges();
      setRows(r.data ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load challenges');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = useMemo(() => rows.filter((r) => r.status === 'active'), [rows]);
  const ended = useMemo(() => rows.filter((r) => r.status !== 'active'), [rows]);

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Savings challenges</Text>
      <Text style={styles.sub}>
        Compete with friends to reach a target fastest. Winner gets a 10% bonus from Gearup (not deducted from players).
      </Text>

      <PrimaryButton title="Create challenge" onPress={() => navigation.navigate('SavingsChallengeDetail', { challengeId: 'new' })} />

      {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} /> : null}
      {err ? <Text style={styles.err}>{err}</Text> : null}

      {!loading && active.length ? (
        <>
          <Text style={styles.section}>Active</Text>
          <FlatList
            data={active}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => navigation.navigate('SavingsChallengeDetail', { challengeId: item.id })}>
                <Card style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.muted}>
                    Target {Number(item.target_amount).toLocaleString()} {item.currency} · Ends{' '}
                    {new Date(item.ends_at).toLocaleDateString()}
                  </Text>
                </Card>
              </Pressable>
            )}
          />
        </>
      ) : null}

      {!loading && ended.length ? (
        <>
          <Text style={styles.section}>Ended</Text>
          <FlatList
            data={ended}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => navigation.navigate('SavingsChallengeDetail', { challengeId: item.id })}>
                <Card style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.muted}>
                    Total {Number(item.total_contributed).toLocaleString()} {item.currency}
                  </Text>
                </Card>
              </Pressable>
            )}
          />
        </>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  muted: { fontSize: 13, color: colors.textMuted },
  err: { marginTop: spacing.md, color: colors.danger, fontWeight: '600' },
});

