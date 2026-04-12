import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postAiToolChat, postAskAutexa } from '../api/aiMarketplace';
import { listMyNotifications } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import { useUiStore } from '../stores/uiStore';
import { isAutexaApiConfigured } from '../config/env';
import { navigateToAppStack } from '../navigation/navigateFromRoot';
import { getErrorMessage } from '../lib/errors';
import type { ChatWidgetSpec } from '../types/chatWidgets';
import { colors, radius, spacing } from '../theme';
import { ChatWidgetTray } from './ChatWidgetTray';
import { TypingIndicator } from './TypingIndicator';
import { shouldForceToolChatForText, shouldRouteBookingTools } from '../utils/aiAssistantRouting';
import { inferLocalChatWidgets } from '../utils/inferChatWidgets';

type ChatActionKind = 'full_assistant' | 'notifications' | 'recent_bookings' | 'browse_home';

type ChatAction = {
  id: string;
  label: string;
  kind: ChatActionKind;
  /** Passed to full assistant as initial prompt when set. */
  seed?: string;
};

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string; actions?: ChatAction[] };

function inferActionsFromAssistantText(content: string): ChatAction[] {
  const lower = content.toLowerCase();
  const actions: ChatAction[] = [];
  const seen = new Set<ChatActionKind>();

  const add = (a: ChatAction) => {
    if (seen.has(a.kind)) return;
    seen.add(a.kind);
    actions.push(a);
  };

  if (
    lower.includes('full assistant') ||
    lower.includes('open the assistant') ||
    (lower.includes('provider') && lower.includes('book') && lower.includes('assistant'))
  ) {
    add({ id: 'infer-full', label: 'Open full assistant', kind: 'full_assistant' });
  }
  if (
    (lower.includes('notification') || lower.includes('notifications')) &&
    (lower.includes('check') || lower.includes('see') || lower.includes('open') || lower.includes('your'))
  ) {
    add({ id: 'infer-notif', label: 'Open notifications', kind: 'notifications' });
  }
  if (
    lower.includes('booking') &&
    (lower.includes('see your') || lower.includes('your bookings') || lower.includes('recent activit'))
  ) {
    add({ id: 'infer-book', label: 'Open recent activities', kind: 'recent_bookings' });
  }
  if (lower.includes('browse') && (lower.includes('service') || lower.includes('home'))) {
    add({ id: 'infer-home', label: 'Go to home', kind: 'browse_home' });
  }

  return actions;
}

const POLL_MS = 45_000;
/** Extra space above the tab bar; increase to lift the hub higher. */
const TAB_BAR_CLEARANCE = 76;

export function FloatingQuickHub() {
  const { isAuthenticated } = useAuth();
  const navLeaf = useUiStore((s) => s.navFocusedLeafName);
  const hideOnAiAssistant = navLeaf === 'AiAssistant';
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatWidgets, setChatWidgets] = useState<ChatWidgetSpec[]>([]);
  const listRef = useRef<FlatList<ChatMsg>>(null);

  const refreshUnread = useCallback(async () => {
    if (!isAuthenticated) {
      setUnread(0);
      return;
    }
    try {
      const { data, error } = await listMyNotifications();
      if (error) return;
      const n = (data ?? []).filter((r) => !r.read_at).length;
      setUnread(n);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setInterval(() => void refreshUnread(), POLL_MS);
    return () => clearInterval(t);
  }, [isAuthenticated, refreshUnread]);

  const bottomOffset = Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE;
  const rightOffset = spacing.lg;

  const openNotifications = () => {
    setExpanded(false);
    navigateToAppStack('Notifications', undefined);
    void refreshUnread();
  };

  const openFullAssistant = () => {
    setExpanded(false);
    navigateToAppStack('AiAssistant', undefined);
  };

  const openAiModal = () => {
    setExpanded(false);
    setAiOpen(true);
    setChatWidgets([]);
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content:
            'Hi — ask for a service (e.g. “car wash tomorrow”) or tap “Full assistant” for booking tools and provider picks.',
          actions: [
            { id: 'welcome-full', label: 'Open full assistant', kind: 'full_assistant' },
          ],
        },
      ]);
    }
  };

  const runChatAction = useCallback((action: ChatAction) => {
    setAiOpen(false);
    switch (action.kind) {
      case 'full_assistant':
        navigateToAppStack('AiAssistant', action.seed ? { seed: action.seed } : undefined);
        break;
      case 'notifications':
        navigateToAppStack('Notifications', undefined);
        break;
      case 'recent_bookings':
        navigateToAppStack('MainTabs', { screen: 'Bookings' });
        break;
      case 'browse_home':
        navigateToAppStack('MainTabs', { screen: 'Home' });
        break;
      default:
        break;
    }
  }, []);

  const sendUserMessage = useCallback(
    async (textRaw: string) => {
      const text = textRaw.trim();
      if (!text || loading) return;
      const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
      setMessages((m) => [...m, userMsg]);
      setChatWidgets([]);
      setLoading(true);
      try {
        if (!isAutexaApiConfigured()) {
          setMessages((m) => [
            ...m,
            {
              id: `e-${Date.now()}`,
              role: 'assistant',
              content: 'Connect the Autexa API (EXPO_PUBLIC_AUTEXA_API_URL) to use chat here.',
            },
          ]);
          return;
        }
        if (shouldRouteBookingTools(text) && !shouldForceToolChatForText(text)) {
          const out = await postAskAutexa(text);
          const actions: ChatAction[] = [];
          let body = (out.reply || 'Done.').trim();
          if (out.providers?.length) {
            body += `\n\nI found ${out.providers.length} provider(s).`;
            actions.push({
              id: 'providers',
              label: 'Pick a provider & book',
              kind: 'full_assistant',
              seed: text,
            });
          }
          if (
            out.action?.type === 'cancel_booking' ||
            out.action?.type === 'update_booking' ||
            out.action?.type === 'show_bookings' ||
            (Array.isArray(out.action?.bookings) && out.action.bookings.length > 0)
          ) {
            actions.push({
              id: 'manage-booking',
              label: 'Continue in full assistant',
              kind: 'full_assistant',
              seed: text,
            });
          }
          const merged = [...actions];
          for (const a of inferActionsFromAssistantText(body)) {
            if (!merged.some((x) => x.kind === a.kind)) merged.push(a);
          }
          setMessages((m) => [
            ...m,
            {
              id: `a-${Date.now()}`,
              role: 'assistant',
              content: body,
              actions: merged.length ? merged : undefined,
            },
          ]);
          if (
            out.action?.type === 'cancel_booking' ||
            out.action?.type === 'update_booking' ||
            out.action?.type === 'show_bookings'
          ) {
            setChatWidgets([]);
          } else {
            const hubWidgets = inferLocalChatWidgets(body, text);
            setChatWidgets(hubWidgets.length ? hubWidgets : []);
          }
          return;
        }
        const { answer, widgets } = await postAiToolChat(text);
        const ans = answer || 'No response.';
        const inferred = inferActionsFromAssistantText(ans);
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: ans,
            actions: inferred.length ? inferred : undefined,
          },
        ]);
        setChatWidgets(Array.isArray(widgets) ? widgets : []);
      } catch (e) {
        setMessages((m) => [...m, { id: `err-${Date.now()}`, role: 'assistant', content: getErrorMessage(e) }]);
      } finally {
        setLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
    },
    [loading],
  );

  const sendChat = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendUserMessage(text);
  }, [input, loading, sendUserMessage]);

  const onWidgetDate = useCallback(
    (iso: string) => {
      setChatWidgets([]);
      void sendUserMessage(`I'm choosing the date: ${iso}.`);
    },
    [sendUserMessage],
  );

  const onWidgetTime = useCallback(
    (timeLabel: string) => {
      setChatWidgets([]);
      void sendUserMessage(`I'm choosing the time: ${timeLabel}.`);
    },
    [sendUserMessage],
  );

  const onWidgetMedia = useCallback(
    ({ kind, summary }: { kind: 'image' | 'audio'; summary: string }) => {
      setChatWidgets([]);
      const intro =
        kind === 'image'
          ? 'I used the in-chat photo tool. Automated image analysis:'
          : 'I used the in-chat audio recorder. Automated sound analysis:';
      void sendUserMessage(`${intro}\n\n${summary}`);
    },
    [sendUserMessage],
  );

  if (!isAuthenticated || hideOnAiAssistant) return null;

  return (
    <>
      {expanded ? (
        <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} accessibilityLabel="Close menu" />
      ) : null}

      <View
        style={[styles.hubWrap, { bottom: bottomOffset, right: rightOffset }]}
        pointerEvents="box-none"
      >
        {expanded ? (
          <View style={styles.menuColumn}>
            <Pressable
              style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
              onPress={openNotifications}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
              onPress={openFullAssistant}
              accessibilityRole="button"
              accessibilityLabel="Full assistant"
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.primaryDark} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuBtn, pressed && styles.menuBtnPressed]}
              onPress={openAiModal}
              accessibilityRole="button"
              accessibilityLabel="Quick help chat"
            >
              <Ionicons name="sparkles" size={22} color={colors.primaryDark} />
            </Pressable>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => setExpanded((e) => !e)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Close quick menu' : 'Open quick menu'}
        >
          <Ionicons name={expanded ? 'close' : 'flash'} size={26} color="#fff" />
        </Pressable>
      </View>

      <Modal visible={aiOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAiOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top}
        >
          <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={styles.modalTitle}>Quick help</Text>
            <View style={styles.modalHeaderActions}>
              <Pressable
                onPress={() => {
                  setAiOpen(false);
                  navigateToAppStack('AiAssistant', undefined);
                }}
                hitSlop={10}
              >
                <Text style={styles.linkBtn}>Full assistant</Text>
              </Pressable>
              <Pressable onPress={() => setAiOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={28} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={styles.listWrap}>
          <FlatList
            ref={listRef}
            style={styles.listFlex}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.msgList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View style={[styles.msgBlock, item.role === 'user' ? styles.msgBlockUser : null]}>
                <View style={[styles.bubble, item.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                  <Text style={[styles.bubbleText, item.role === 'user' && styles.bubbleTextUser]}>{item.content}</Text>
                </View>
                {item.role === 'assistant' && item.actions?.length ? (
                  <View style={styles.actionStack}>
                    {item.actions.map((a) => (
                      <Pressable
                        key={a.id}
                        style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                        onPress={() => runChatAction(a)}
                        accessibilityRole="button"
                        accessibilityLabel={a.label}
                      >
                        <Text style={styles.actionBtnText}>{a.label}</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
            ListFooterComponent={loading ? <TypingIndicator /> : null}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
          </View>

          <ChatWidgetTray
            widgets={chatWidgets}
            onPickDate={onWidgetDate}
            onPickTime={onWidgetTime}
            onMediaAnalyzed={onWidgetMedia}
            disabled={loading}
          />

          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask for a service or question…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline={false}
              maxLength={2000}
              editable={!loading}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={() => void sendChat()}
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => void sendChat()}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="arrow-up" size={22} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const FAB = 56;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
    zIndex: 50,
  },
  hubWrap: {
    position: 'absolute',
    zIndex: 100,
    alignItems: 'flex-end',
  },
  menuColumn: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  menuBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  menuBtnPressed: { opacity: 0.9 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: { opacity: 0.92 },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  listFlex: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  modalHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  linkBtn: { fontSize: 15, fontWeight: '700', color: colors.primary },
  msgList: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  msgBlock: {
    alignSelf: 'stretch',
    marginBottom: spacing.sm,
  },
  msgBlockUser: {
    alignSelf: 'flex-end',
  },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleAi: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  bubbleTextUser: { color: '#fff' },
  actionStack: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    maxWidth: '100%',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionBtnPressed: { opacity: 0.88 },
  actionBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
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
  sendBtnDisabled: { opacity: 0.45 },
});
