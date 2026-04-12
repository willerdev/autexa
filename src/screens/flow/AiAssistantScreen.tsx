import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deleteAiToolChatHistory,
  postAiToolChat,
  postAskAutexa,
  postAutoBookAutexa,
  postCancelBookingAutexa,
  postUpdateBookingAutexa,
  type ChatBillPreviewPayload,
} from '../../api/aiMarketplace';
import { Card, ChatWidgetTray, Screen, TypingIndicator } from '../../components';
import type { BookingPaymentMethodChoice } from '../../components/ChatWidgetTray';
import { isAutexaApiConfigured } from '../../config/env';
import { getErrorMessage } from '../../lib/errors';
import { useSessionStore } from '../../stores/sessionStore';
import { colors, radius, spacing } from '../../theme';
import type { AppStackParamList } from '../../types';
import type { ChatWidgetSpec } from '../../types/chatWidgets';
import { addDays, toLocalDateString } from '../../utils/dateFormat';
import { shouldForceToolChatForText, shouldRouteBookingTools } from '../../utils/aiAssistantRouting';
import { inferLocalChatWidgets } from '../../utils/inferChatWidgets';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  billPreview?: {
    textReceipt?: { title: string; lines: string[] };
  };
};

/** Text receipt only — no generated bill images in Ask Autexa. */
function billBlockFromPayload(billPreview: ChatBillPreviewPayload | null | undefined): Msg['billPreview'] | undefined {
  if (!billPreview?.textReceipt?.lines?.length) return undefined;
  return { textReceipt: billPreview.textReceipt };
}

type BookNavOffer = {
  providerId: string;
  providerName: string;
  serviceName?: string;
  bookingId: string;
  date?: string;
  time?: string;
  paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
};

type Props = NativeStackScreenProps<AppStackParamList, 'AiAssistant'>;

export function AiAssistantScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionPrompt, setActionPrompt] = useState<string | null>(null);
  const [providerOptions, setProviderOptions] = useState<
    { id: string; name: string; price_cents: number; rating: number; distance_km: number; availability: string; serviceName?: string }[]
  >([]);
  const [bookingOptions, setBookingOptions] = useState<
    {
      id: string;
      date: string;
      time: string;
      status: string;
      service_name: string | null;
      payment_status?: string | null;
      payment_method?: string | null;
      providers: { name: string } | null;
    }[]
  >([]);
  const lastServiceNameRef = useRef<string | undefined>(undefined);
  const listRef = useRef<FlatList>(null);
  const seededRef = useRef(false);
  const pendingRef = useRef<
    | null
    | {
        strategy: 'cheapest' | 'nearest' | 'best_rated';
        serviceName: string;
        step: 'when' | 'date' | 'time' | 'payment';
        date?: string;
        time?: string;
        paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
      }
  >(null);
  const pendingCancelRef = useRef<null | { bookingId: string; step: 'reason' }>(null);
  const pendingUpdateRef = useRef<
    | null
    | {
        bookingId: string;
        step: 'date' | 'time' | 'payment';
        date?: string;
        time?: string;
        paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
      }
  >(null);
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [chatWidgets, setChatWidgets] = useState<ChatWidgetSpec[]>([]);
  const [bookNavOffer, setBookNavOffer] = useState<BookNavOffer | null>(null);

  function pushAssistant(text: string, showInputWidgets = false, billPreview?: Msg['billPreview']) {
    const id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setMessages((m) => [
      ...m,
      {
        id,
        role: 'assistant',
        content: text,
        ...(billPreview ? { billPreview } : {}),
      },
    ]);
    if (showInputWidgets) {
      const w = inferLocalChatWidgets(text);
      setChatWidgets(w.length ? w : []);
    } else {
      setChatWidgets([]);
    }
  }

  function syncWidgetsFromPrompt(promptText: string) {
    const w = inferLocalChatWidgets(promptText);
    setChatWidgets(w.length ? w : []);
  }

  function parseDate(text: string): string | null {
    const t = text.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (t.includes('today')) return toLocalDateString(today);
    if (t.includes('tomorrow')) return toLocalDateString(addDays(today, 1));
    const m = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  function parseTime(text: string): string | null {
    const t = text.trim().toLowerCase();
    if (t === 'asap' || t.includes('asap')) return 'ASAP';
    // 2pm / 2:30pm / 14:00
    const m1 = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (m1) {
      const h = Number(m1[1]);
      const mm = m1[2] ?? '00';
      const ap = m1[3].toUpperCase();
      return `${h}:${mm} ${ap}`;
    }
    const m2 = t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (m2) return `${m2[1]}:${m2[2]}`;
    return null;
  }

  function parsePayment(text: string): 'card' | 'mobile_money' | 'pay_later' | 'wallet' | null {
    const t = text.trim().toLowerCase();
    if (t.includes('wallet') || t.includes('autexa balance') || t.includes('in-app balance')) return 'wallet';
    if (t.includes('later') || t.includes('not now') || t.includes('pay later') || /\bcash\b/.test(t)) return 'pay_later';
    if (t.includes('mobile') || t.includes('momo') || t.includes('mpesa') || t.includes('airtel money')) return 'mobile_money';
    if (t.includes('card') || t.includes('stripe') || t.includes('credit') || t.includes('debit')) return 'card';
    return null;
  }

  const bookingOptionsRef = useRef(bookingOptions);
  const actionPromptRef = useRef(actionPrompt);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    bookingOptionsRef.current = bookingOptions;
  }, [bookingOptions]);
  useEffect(() => {
    actionPromptRef.current = actionPrompt;
  }, [actionPrompt]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;

    const userMsg: Msg = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      role: 'user',
      content: text,
    };
    setMessages((m) => [...m, userMsg]);

    const pendingCancel = pendingCancelRef.current;
    if (pendingCancel) {
      pendingCancelRef.current = null;
      setActionPrompt(null);
      pushAssistant('Cancelling your booking…');
      setCancelingBookingId(pendingCancel.bookingId);
      setLoading(true);
      try {
        await postCancelBookingAutexa({ bookingId: pendingCancel.bookingId, reason: text });
        pushAssistant('Done — your booking is cancelled. I saved this in your notifications.');
        void useSessionStore.getState().refreshUserAiContext();
        setBookingOptions((prev) =>
          prev.map((b) => (b.id === pendingCancel.bookingId ? { ...b, status: 'cancelled' } : b)),
        );
      } catch (e) {
        pushAssistant(getErrorMessage(e));
      } finally {
        setCancelingBookingId(null);
        setLoading(false);
      }
      return;
    }

    const pendingUpdate = pendingUpdateRef.current;
    if (pendingUpdate) {
      const lower = text.toLowerCase();
      if (pendingUpdate.step === 'date') {
        const d = parseDate(text);
        if (!d) {
          const p = 'Please reply with: today / tomorrow / YYYY-MM-DD';
          setActionPrompt(p);
          syncWidgetsFromPrompt(p);
          return;
        }
        pendingUpdate.date = d;
        pendingUpdate.step = 'time';
        const pt = 'New time? (e.g. 10:30 AM, 2pm, or ASAP)';
        setActionPrompt(pt);
        syncWidgetsFromPrompt(pt);
        return;
      }
      if (pendingUpdate.step === 'time') {
        const tm = parseTime(text);
        if (!tm) {
          const p = 'Please reply with a time like 10:30 AM, 2pm, or ASAP';
          setActionPrompt(p);
          syncWidgetsFromPrompt(p);
          return;
        }
        pendingUpdate.time = tm;
        pendingUpdate.step = 'payment';
        const pp =
          'Payment method? Wallet, mobile money deposit (Flutterwave v4), cash (pay later) — or type “skip” to keep current';
        setActionPrompt(pp);
        syncWidgetsFromPrompt(pp);
        return;
      }
      if (pendingUpdate.step === 'payment') {
        const pm = lower.includes('skip') ? undefined : parsePayment(text);
        if (!lower.includes('skip') && !pm) {
          const p = 'Choose: wallet, card, cash (pay later), or mobile money — or type “skip”';
          setActionPrompt(p);
          syncWidgetsFromPrompt(p);
          return;
        }
        pendingUpdate.paymentMethod = pm ?? undefined;
        const { bookingId, date, time, paymentMethod } = pendingUpdate;
        pendingUpdateRef.current = null;
        setActionPrompt(null);
        pushAssistant('Updating your booking…');
        setUpdatingBookingId(bookingId);
        setLoading(true);
        try {
          const r = await postUpdateBookingAutexa({ bookingId, date, time, paymentMethod });
          pushAssistant('Done — your booking was updated. I saved this in your notifications.');
          void useSessionStore.getState().refreshUserAiContext();
          setBookingOptions((prev) =>
            prev.map((b) =>
              b.id === bookingId
                ? {
                    ...b,
                    date: r.booking?.date ?? date ?? b.date,
                    time: r.booking?.time ?? time ?? b.time,
                    payment_method: r.booking?.payment_method ?? b.payment_method,
                  }
                : b,
            ),
          );
        } catch (e) {
          pushAssistant(getErrorMessage(e));
        } finally {
          setUpdatingBookingId(null);
          setLoading(false);
        }
        return;
      }
    }
    // Slot-filling for auto-book flows
    const pending = pendingRef.current;
    if (pending) {
      const lower = text.toLowerCase();
      if (pending.step === 'when') {
        const asap = lower.includes('asap');
        if (asap) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          pending.date = toLocalDateString(today);
          pending.time = 'ASAP';
          pending.step = 'payment';
          pushAssistant('Payment method? Wallet, mobile money (Flutterwave v4), cash (pay later), or mobile money.', true);
          return;
        }
        pending.step = 'date';
        pushAssistant('When should it happen? Reply with: today / tomorrow / YYYY-MM-DD', true);
        return;
      }
      if (pending.step === 'date') {
        const d = parseDate(text);
        if (!d) {
          pushAssistant('Please reply with: today / tomorrow / YYYY-MM-DD', true);
          return;
        }
        pending.date = d;
        pending.step = 'time';
        pushAssistant('What time? (e.g. 10:30 AM, 2pm, or ASAP)', true);
        return;
      }
      if (pending.step === 'time') {
        const tm = parseTime(text);
        if (!tm) {
          pushAssistant('Please reply with a time like 10:30 AM, 2pm, or ASAP', true);
          return;
        }
        pending.time = tm;
        pending.step = 'payment';
        pushAssistant('Payment method? Wallet, mobile money (Flutterwave v4), cash (pay later), or mobile money.', true);
        return;
      }
      if (pending.step === 'payment') {
        const pm = parsePayment(text);
        if (!pm) {
          pushAssistant('Choose: wallet, card, cash (pay later), or mobile money.', true);
          return;
        }
        pending.paymentMethod = pm;
        // execute booking
        pendingRef.current = null;
        pushAssistant('Booking for you in progress… sit and relax.');
        setLoading(true);
        try {
          const r = await postAutoBookAutexa({
            text: `book ${pending.strategy}`,
            strategy: pending.strategy,
            serviceName: pending.serviceName,
            date: pending.date,
            time: pending.time,
            paymentMethod: pending.paymentMethod,
          });
          const billBlock = billBlockFromPayload(r.billPreview);
          pushAssistant(
            `Booked ${r.service.name} with ${r.provider.name}. You’ll see a notification shortly.`,
            false,
            billBlock,
          );
          void useSessionStore.getState().refreshUserAiContext();
          setProviderOptions([]);
          setBookNavOffer({
            providerId: r.provider.id,
            providerName: r.provider.name,
            serviceName: r.service.name,
            bookingId: r.booking.id,
            date: pending.date,
            time: pending.time,
            paymentMethod: pending.paymentMethod,
          });
        } catch (e) {
          pushAssistant(getErrorMessage(e));
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    if (!isAutexaApiConfigured()) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'Set EXPO_PUBLIC_AUTEXA_API_URL and run the Node API (see /server).',
        },
      ]);
      return;
    }
    const hadBookingsPanel =
      (bookingOptionsRef.current?.length ?? 0) > 0 || Boolean(actionPromptRef.current);
    const usePitstop =
      shouldRouteBookingTools(text) && !hadBookingsPanel && !shouldForceToolChatForText(text);

    setLoading(true);
    try {
      if (usePitstop) {
        setProviderOptions([]);
        setBookingOptions([]);
        setActionPrompt(null);
        setChatWidgets([]);
        const out = await postAskAutexa(text);
        const reply = out.reply || 'Done.';
        if (out.action?.type === 'cancel_booking' && Array.isArray(out.action.bookings)) {
          setChatWidgets([]);
          setBookingOptions(out.action.bookings as any[]);
          setActionPrompt(reply);
          return;
        }
        if (out.action?.type === 'show_bookings' && Array.isArray(out.action.bookings)) {
          setChatWidgets([]);
          setBookingOptions(out.action.bookings as any[]);
          setActionPrompt(reply);
          return;
        }
        if (out.action?.type === 'update_booking' && Array.isArray(out.action.bookings)) {
          setChatWidgets([]);
          setBookingOptions(out.action.bookings as any[]);
          setActionPrompt(reply);
          return;
        }
        setMessages((m) => [
          ...m,
          { id: `a-${Date.now()}`, role: 'assistant', content: reply || 'No response.' },
        ]);
        const inferredFromPitstop = inferLocalChatWidgets(reply, text);
        setChatWidgets(inferredFromPitstop.length ? inferredFromPitstop : []);
        if (Array.isArray(out.providers) && out.providers.length) {
          lastServiceNameRef.current = out.service?.name;
          setProviderOptions(
            out.providers.map((p) => ({
              ...p,
              serviceName: out.service?.name,
            })),
          );
        } else {
          lastServiceNameRef.current = out.service?.name ?? undefined;
        }
        return;
      }

      setProviderOptions([]);
      setChatWidgets([]);
      const { answer, widgets, billPreview } = await postAiToolChat(text);
      const billBlock = billBlockFromPayload(billPreview);
      let mergedWidgets = Array.isArray(widgets) ? widgets : [];
      if (!mergedWidgets.some((w) => w.type === 'payment_method_picker')) {
        const guessed = inferLocalChatWidgets(answer, text);
        if (guessed.some((w) => w.type === 'payment_method_picker')) {
          mergedWidgets = [...mergedWidgets, ...guessed.filter((w) => w.type === 'payment_method_picker')];
        }
      }
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: answer || 'No response.',
          billPreview: billBlock,
        },
      ]);
      setChatWidgets(mergedWidgets);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: `err-${Date.now()}`, role: 'assistant', content: getErrorMessage(e) },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const autoBook = useCallback(
    async (strategy: 'cheapest' | 'nearest' | 'best_rated') => {
      const serviceName = lastServiceNameRef.current;
      if (!serviceName) {
        setMessages((m) => [
          ...m,
          { id: `a-${Date.now()}`, role: 'assistant', content: 'Tell me which service you need first (e.g. “I need a mechanic”).' },
        ]);
        return;
      }
      const strategyLabel =
        strategy === 'cheapest' ? 'Book with cheapest provider' : strategy === 'nearest' ? 'Book with nearest provider' : 'Book with best-rated provider';
      setMessages((m) => [
        ...m,
        { id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, role: 'user', content: strategyLabel },
      ]);
      // Ask follow-ups (varies by service). For urgent roadside services we allow ASAP.
      const needsWhen = /tow|battery|jump/i.test(serviceName);
      pendingRef.current = {
        strategy,
        serviceName,
        step: needsWhen ? 'when' : 'date',
      };
      pushAssistant(
        needsWhen ? 'When do you need it? Reply: ASAP or schedule' : 'What date? Reply: today / tomorrow / YYYY-MM-DD',
        true,
      );
    },
    [setMessages],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await sendText(text);
  }, [input, loading, sendText]);

  const clearServerChat = useCallback(async () => {
    try {
      if (isAutexaApiConfigured()) {
        await deleteAiToolChatHistory();
      }
    } catch {
      // non-fatal
    }
    setMessages([]);
    setProviderOptions([]);
    setBookingOptions([]);
    setActionPrompt(null);
    setChatWidgets([]);
    pendingRef.current = null;
    pendingCancelRef.current = null;
    pendingUpdateRef.current = null;
    lastServiceNameRef.current = undefined;
    setBookNavOffer(null);
  }, []);

  const onWidgetDate = useCallback(
    (iso: string) => {
      setChatWidgets([]);
      void sendText(`I'm choosing the date: ${iso}.`);
    },
    [sendText],
  );

  const onWidgetTime = useCallback(
    (timeLabel: string) => {
      setChatWidgets([]);
      void sendText(`I'm choosing the time: ${timeLabel}.`);
    },
    [sendText],
  );

  const onWidgetPayment = useCallback(
    (method: BookingPaymentMethodChoice) => {
      setChatWidgets([]);
      const labels: Record<BookingPaymentMethodChoice, string> = {
        wallet: 'Autexa wallet',
        card: 'Mobile money (Flutterwave v4)',
        pay_later: 'Cash / pay later',
        mobile_money: 'Mobile money',
      };
      void sendText(`I'm choosing payment: ${labels[method]} (${method}).`);
    },
    [sendText],
  );

  const onWidgetMedia = useCallback(
    ({ kind, summary }: { kind: 'image' | 'audio'; summary: string }) => {
      setChatWidgets([]);
      const intro =
        kind === 'image'
          ? 'I used the in-chat photo tool. Automated image analysis:'
          : 'I used the in-chat audio recorder. Automated sound analysis:';
      void sendText(`${intro}\n\n${summary}`);
    },
    [sendText],
  );

  useEffect(() => {
    const seed = route.params?.seed?.trim();
    if (!seed || seededRef.current) return;
    seededRef.current = true;
    // send the seed without waiting for user interaction
    void (async () => {
      try {
        await sendText(seed);
      } catch {
        // handled inside sendText
      }
    })();
  }, [route.params?.seed, sendText]);

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Ask Autexa</Text>
          <Pressable onPress={() => void clearServerChat()} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        </View>
        <Text style={styles.welcome}>
          Try: “I need a mechanic” or “Cheapest car wash”. After you book in chat, you’ll see a text bill here — open the booking screen only when you choose to.
        </Text>
        <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          style={styles.listFlex}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            <>
              {loading ? <TypingIndicator /> : null}
              {bookNavOffer ? (
                <View style={styles.bookNavCard}>
                  <Text style={styles.bookNavTitle}>Booking saved</Text>
                  <Text style={styles.bookNavHint}>Stay in chat or open your booking details.</Text>
                  <View style={styles.bookNavRow}>
                    <Pressable
                      style={({ pressed }) => [styles.bookNavBtnPrimary, pressed && styles.strategyChipPressed]}
                      onPress={() => {
                        const p = bookNavOffer;
                        setBookNavOffer(null);
                        navigation.navigate('BookingConfirm', {
                          providerId: p.providerId,
                          providerName: p.providerName,
                          serviceName: p.serviceName,
                          bookingId: p.bookingId,
                          date: p.date,
                          time: p.time,
                          paymentMethod: p.paymentMethod,
                        });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Open booking details"
                    >
                      <Text style={styles.bookNavBtnPrimaryText}>Open booking</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.bookNavBtnSecondary, pressed && styles.strategyChipPressed]}
                      onPress={() => setBookNavOffer(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Stay in chat"
                    >
                      <Text style={styles.bookNavBtnSecondaryText}>Stay in chat</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
              {bookingOptions.length ? (
                <View style={styles.options}>
                  <View style={styles.optionsHeader}>
                    <Text style={styles.optionsTitle}>Your bookings</Text>
                  </View>
                  {bookingOptions.map((b) => (
                    <View key={b.id} style={styles.optionRow}>
                      <View style={styles.optionLeft}>
                        <Text style={styles.optionName}>
                          {(b.service_name || 'Service').toString()} · {(b.providers?.name || 'Provider').toString()}
                        </Text>
                        <Text style={styles.optionMeta}>
                          {b.date} · {b.time} · {(b.status || '').toString()}
                        </Text>
                      </View>
                      {String(b.status || '').toLowerCase() === 'cancelled' ? (
                        <View style={styles.cancelledPill}>
                          <Text style={styles.cancelledText}>Cancelled</Text>
                        </View>
                      ) : (
                        <View style={styles.bookingActions}>
                          <Pressable
                            style={[styles.bookBtn, (cancelingBookingId === b.id || loading) && styles.bookBtnDisabled]}
                            disabled={loading || cancelingBookingId === b.id}
                            onPress={() => {
                              pendingCancelRef.current = { bookingId: b.id, step: 'reason' };
                              setActionPrompt('Why are you cancelling? Type a reason, or reply “skip” for a default.');
                              setChatWidgets([]);
                            }}
                          >
                            {cancelingBookingId === b.id ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.bookBtnText}>Cancel</Text>
                            )}
                          </Pressable>
                          <Pressable
                            style={[styles.secondaryBtn, (updatingBookingId === b.id || loading) && styles.bookBtnDisabled]}
                            disabled={loading || updatingBookingId === b.id}
                            onPress={() => {
                              pendingUpdateRef.current = { bookingId: b.id, step: 'date' };
                              const p = 'What new date? Reply: today / tomorrow / YYYY-MM-DD';
                              setActionPrompt(p);
                              syncWidgetsFromPrompt(p);
                            }}
                          >
                            {updatingBookingId === b.id ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.secondaryBtnText}>Change</Text>
                            )}
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                  {actionPrompt ? <Text style={styles.actionPrompt}>{actionPrompt}</Text> : null}
                </View>
              ) : providerOptions.length > 0 && !bookNavOffer ? (
                <View style={styles.options}>
                  <View style={styles.optionsHeader}>
                    <Text style={styles.optionsTitle}>Providers</Text>
                    <View style={styles.autoRow}>
                      <Pressable
                        style={({ pressed }) => [styles.strategyChip, pressed && styles.strategyChipPressed]}
                        onPress={() => void autoBook('cheapest')}
                        accessibilityRole="button"
                        accessibilityLabel="Book with cheapest provider"
                      >
                        <Text style={styles.strategyChipText}>Cheapest</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.strategyChip, pressed && styles.strategyChipPressed]}
                        onPress={() => void autoBook('nearest')}
                        accessibilityRole="button"
                        accessibilityLabel="Book with nearest provider"
                      >
                        <Text style={styles.strategyChipText}>Nearest</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.strategyChip, pressed && styles.strategyChipPressed]}
                        onPress={() => void autoBook('best_rated')}
                        accessibilityRole="button"
                        accessibilityLabel="Book with best rated provider"
                      >
                        <Text style={styles.strategyChipText}>Best rated</Text>
                      </Pressable>
                    </View>
                  </View>
                  {providerOptions.map((p) => (
                    <View key={p.id} style={styles.optionRow}>
                      <View style={styles.optionLeft}>
                        <Text style={styles.optionName}>{p.name}</Text>
                        <Text style={styles.optionMeta}>
                          ${(p.price_cents / 100).toFixed(2)} · ⭐ {p.rating.toFixed(1)} · {p.distance_km.toFixed(1)} km · {p.availability}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.bookBtn}
                        onPress={() =>
                          navigation.navigate('BookingConfirm', {
                            providerId: p.id,
                            providerName: p.name,
                            serviceName: p.serviceName,
                          })
                        }
                      >
                        <Text style={styles.bookBtnText}>Book</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          }
          renderItem={({ item }) => (
            <Card
              style={[
                styles.bubble,
                item.role === 'user' ? styles.bubbleUser : styles.bubbleAi,
              ]}
            >
              <Text style={styles.bubbleText}>{item.content}</Text>
              {item.billPreview?.textReceipt?.lines?.length ? (
                <View style={styles.textReceipt}>
                  <Text style={styles.billCaption}>{item.billPreview.textReceipt.title}</Text>
                  {item.billPreview.textReceipt.lines.map((line: string, idx: number) => (
                    <Text key={`${line}-${idx}`} style={styles.receiptLine}>
                      {line}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Card>
          )}
        />
        </View>
        <ChatWidgetTray
          widgets={chatWidgets}
          onPickDate={onWidgetDate}
          onPickTime={onWidgetTime}
          onPickPayment={onWidgetPayment}
          onMediaAnalyzed={onWidgetMedia}
          disabled={loading}
        />
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, spacing.sm) + 34 }]}>
          <TextInput
            style={styles.input}
            placeholder="Ask Autexa…"
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            editable={!loading}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void send()}
            multiline={false}
          />
          <Pressable
            onPress={() => void send()}
            disabled={loading}
            style={({ pressed }) => [
              styles.sendIconBtn,
              loading && styles.sendIconBtnDisabled,
              pressed && !loading && styles.sendIconBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="arrow-forward" size={22} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  headerSide: {
    minWidth: 64,
  },
  back: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  clear: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'right',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  welcome: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  listFlex: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    flexGrow: 1,
  },
  options: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  optionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    maxWidth: '70%',
  },
  optionsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  strategyChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  strategyChipPressed: {
    opacity: 0.85,
  },
  strategyChipText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  bookingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  optionMeta: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bookBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  bookBtnDisabled: {
    opacity: 0.7,
  },
  bookBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  cancelledPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelledText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  actionPrompt: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  bubble: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
  },
  bubbleUser: {
    marginLeft: spacing.xl,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  bubbleAi: {
    marginRight: spacing.lg,
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  textReceipt: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  receiptLine: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.text,
    lineHeight: 18,
  },
  billCaption: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  bookNavCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  bookNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  bookNavHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 18,
  },
  bookNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bookNavBtnPrimary: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  bookNavBtnPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  bookNavBtnSecondary: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  bookNavBtnSecondaryText: {
    color: colors.primaryDark,
    fontWeight: '800',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sendIconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIconBtnDisabled: {
    opacity: 0.55,
  },
  sendIconBtnPressed: {
    opacity: 0.88,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
