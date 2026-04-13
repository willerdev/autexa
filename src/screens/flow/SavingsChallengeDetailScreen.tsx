import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  contributeToSavingsChallenge,
  createSavingsChallenge,
  fetchSavingsChallengeDetail,
  type ChallengeLeaderboardRow,
  type SavingsChallenge,
} from '../../api/savingsChallenges';
import { Card, PrimaryButton, ScreenScroll, TextField } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';

function num(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : NaN;
}

function pct(contributed: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(1, contributed / target));
}

function ProgressBar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.barWrap}>
      <View style={[styles.barFill, { width: `${w}%` }]} />
    </View>
  );
}

export function SavingsChallengeDetailScreen({ route }: { route: { params: { challengeId: string } } }) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const id = route.params.challengeId;

  const [challenge, setChallenge] = useState<SavingsChallenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [starting, setStarting] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (id === 'new') {
      setChallenge(null);
      setLeaderboard([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const r = await fetchSavingsChallengeDetail(id);
      setChallenge(r.challenge);
      setLeaderboard(r.leaderboard ?? []);
    } catch (e) {
      Alert.alert('Challenge', e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const targetNum = challenge ? Number(challenge.target_amount) : num(target);
  const startNum = challenge ? Number(challenge.starting_amount) : num(starting) || 0;
  const isEnded = challenge?.status === 'ended';

  const rows = useMemo(() => {
    return (leaderboard ?? []).map((r, idx) => {
      const total = Number(r.contributed || 0) + startNum;
      return { ...r, rank: idx + 1, total };
    });
  }, [leaderboard, startNum]);

  async function onCreate() {
    const t = num(target);
    const s = starting.trim() ? num(starting) : 0;
    const end = endsAt.trim();
    if (!Number.isFinite(t) || t < 1000) return Alert.alert('Create', 'Target must be at least 1,000 UGX.');
    if (!Number.isFinite(s) || s < 0) return Alert.alert('Create', 'Starting amount must be 0 or more.');
    if (!end) return Alert.alert('Create', 'Set an end date/time (ISO or YYYY-MM-DD).');
    const dt = new Date(end);
    if (Number.isNaN(dt.getTime())) return Alert.alert('Create', 'End date is invalid. Try YYYY-MM-DD.');
    try {
      setBusy(true);
      const ch = await createSavingsChallenge({
        title: title.trim() || undefined,
        targetAmount: t,
        startingAmount: s,
        endsAt: dt.toISOString(),
      });
      navigation.replace('SavingsChallengeDetail', { challengeId: ch.id });
    } catch (e) {
      Alert.alert('Create', e instanceof Error ? e.message : 'Could not create');
    } finally {
      setBusy(false);
    }
  }

  async function onContribute() {
    if (!challenge) return;
    const a = num(amount);
    if (!Number.isFinite(a) || a <= 0) return Alert.alert('Contribute', 'Enter a valid amount.');
    try {
      setBusy(true);
      await contributeToSavingsChallenge(challenge.id, { amount: a, source: 'wallet' });
      setAmount('');
      await load();
    } catch (e) {
      Alert.alert('Contribute', e instanceof Error ? e.message : 'Could not contribute');
    } finally {
      setBusy(false);
    }
  }

  if (id === 'new') {
    return (
      <ScreenScroll edges={['top', 'left', 'right']}>
        <Text style={styles.title}>Create challenge</Text>
        <Card>
          <TextField label="Title" placeholder="e.g. April saving sprint" value={title} onChangeText={setTitle} />
          <TextField
            label="Target amount (UGX)"
            keyboardType="number-pad"
            placeholder="e.g. 200000"
            value={target}
            onChangeText={setTarget}
          />
          <TextField
            label="Starting amount (UGX)"
            keyboardType="number-pad"
            placeholder="e.g. 0"
            value={starting}
            onChangeText={setStarting}
          />
          <TextField
            label="Ends at (YYYY-MM-DD or ISO)"
            placeholder="e.g. 2026-05-01"
            value={endsAt}
            onChangeText={setEndsAt}
          />
          <PrimaryButton title="Create" onPress={() => void onCreate()} loading={busy} />
        </Card>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll edges={['top', 'left', 'right']}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : challenge ? (
        <>
          <Text style={styles.title}>{challenge.title}</Text>
          <Text style={styles.sub}>
            Target {Number(challenge.target_amount).toLocaleString()} {challenge.currency} · Ends{' '}
            {new Date(challenge.ends_at).toLocaleString()}
          </Text>
          <Card style={styles.card}>
            <Text style={styles.section}>Leaderboard</Text>
            {rows.length === 0 ? <Text style={styles.muted}>No contributions yet.</Text> : null}
            {rows.map((r) => {
              const progress = pct(r.total, targetNum);
              const isWinner = Number.isFinite(targetNum) && r.total >= targetNum;
              return (
                <View key={r.user_id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rank}>#{r.rank}</Text>
                    <Text style={styles.userId} numberOfLines={1}>
                      {r.user_id.slice(0, 8)}
                    </Text>
                    {isWinner ? (
                      <View style={styles.winnerChip}>
                        <Ionicons name="trophy" size={14} color={colors.primaryDark} />
                        <Text style={styles.winnerText}>Reached</Text>
                      </View>
                    ) : null}
                    <Text style={styles.total}>
                      {Math.round(r.total).toLocaleString()} {challenge.currency}
                    </Text>
                  </View>
                  <ProgressBar value={progress} />
                </View>
              );
            })}
          </Card>

          {!isEnded ? (
            <>
              <Text style={styles.section}>Contribute</Text>
              <Card>
                <Text style={styles.muted}>
                  Contributing moves money from your Wallet into your Savings and counts toward the challenge.
                </Text>
                <TextField
                  label="Amount (UGX)"
                  keyboardType="number-pad"
                  placeholder="e.g. 50000"
                  value={amount}
                  onChangeText={setAmount}
                />
                <PrimaryButton title="Contribute from wallet" onPress={() => void onContribute()} loading={busy} />
              </Card>
            </>
          ) : (
            <Card>
              <Text style={styles.muted}>This challenge has ended.</Text>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Text style={styles.muted}>Challenge not found.</Text>
        </Card>
      )}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '900', color: colors.text, marginBottom: spacing.xs },
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: { marginBottom: spacing.md },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  row: { marginBottom: spacing.md },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  rank: { fontWeight: '900', color: colors.text },
  userId: { flex: 1, color: colors.textSecondary, fontSize: 12 },
  total: { fontWeight: '800', color: colors.text },
  winnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
  },
  winnerText: { fontSize: 12, fontWeight: '800', color: colors.primaryDark },
  barWrap: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});

