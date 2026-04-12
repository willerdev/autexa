import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listMessagesWithPeer, sendMessage, subscribeToConversation } from '../../api/messages';
import type { MessageRow } from '../../api/messages';
import { env } from '../../config/env';
import { useAuth } from '../../context/AuthContext';
import type { ChatMessage } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

function rowToUi(row: MessageRow, myId: string): ChatMessage {
  return {
    id: row.id,
    text: row.message,
    sentAt: row.created_at,
    isMine: row.sender_id === myId,
  };
}

export function ChatScreen() {
  const { session } = useAuth();
  const myId = session?.user?.id;
  const peerId = env.supportUserId;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const canChat = Boolean(myId && peerId);

  const headerSub = useMemo(() => {
    if (!peerId) return 'Set EXPO_PUBLIC_SUPPORT_USER_ID in .env (Supabase Auth user UUID)';
    return 'Autexa support';
  }, [peerId]);

  useEffect(() => {
    if (!myId || !peerId) {
      setLoading(false);
      setMessages([]);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await listMessagesWithPeer(myId, peerId);
      if (err) {
        setError(getErrorMessage(err));
        setMessages([]);
      } else {
        setMessages(data.map((r) => rowToUi(r, myId)));
      }
      setLoading(false);
      unsubscribe = subscribeToConversation(myId, peerId, (row) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [...prev, rowToUi(row, myId)];
        });
      });
    })();

    return () => {
      unsubscribe?.();
    };
  }, [myId, peerId]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !myId || !peerId) return;
    setSending(true);
    setInput('');
    try {
      const { data, error: err } = await sendMessage({ senderId: myId, receiverId: peerId, text: trimmed });
      if (err) {
        setError(getErrorMessage(err));
        setInput(trimmed);
        return;
      }
      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [...prev, rowToUi(data, myId)];
        });
      }
    } catch (e) {
      setError(getErrorMessage(e));
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  }, [input, myId, peerId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support chat</Text>
        <Text style={styles.headerSub}>{headerSub}</Text>
      </View>
      {error ? <Text style={styles.banner}>{error}</Text> : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.bubbleWrap, item.isMine ? styles.alignEnd : styles.alignStart]}>
                <View style={[styles.bubble, item.isMine ? styles.bubbleMine : styles.bubbleThem]}>
                  <Text style={[styles.bubbleText, item.isMine && styles.bubbleTextMine]}>{item.text}</Text>
                </View>
              </View>
            )}
          />
        )}
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={canChat ? 'Type a message' : 'Chat unavailable'}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
            editable={canChat && !sending}
          />
          <Pressable
            onPress={() => void send()}
            style={[styles.sendBtn, (!canChat || sending) && styles.sendDisabled]}
            hitSlop={8}
            disabled={!canChat || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  headerSub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  banner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryMuted,
    color: colors.primaryDark,
    fontSize: 13,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  loader: {
    marginTop: spacing.xl,
  },
  bubbleWrap: {
    marginBottom: spacing.sm,
    maxWidth: '100%',
  },
  alignStart: {
    alignSelf: 'flex-start',
  },
  alignEnd: {
    alignSelf: 'flex-end',
  },
  bubble: {
    maxWidth: '85%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
  },
  bubbleText: {
    fontSize: 16,
    color: colors.text,
  },
  bubbleTextMine: {
    color: '#fff',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
});
