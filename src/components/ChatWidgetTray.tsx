import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { postAssistantChatAttachment } from '../api/assistantMedia';
import { navigateToAppStack } from '../navigation/navigateFromRoot';
import { colors, radius, spacing } from '../theme';
import { formatDateChipLabel, toLocalDateString } from '../utils/dateFormat';
import type { ChatWidgetSpec } from '../types/chatWidgets';

export type BookingPaymentMethodChoice = 'wallet' | 'card' | 'pay_later' | 'mobile_money';

type Props = {
  widgets: ChatWidgetSpec[];
  /** Called with YYYY-MM-DD */
  onPickDate: (isoDate: string) => void;
  /** Called with human time e.g. "2:30 PM" */
  onPickTime: (timeLabel: string) => void;
  /** After server analyzes image or audio */
  onMediaAnalyzed: (payload: { kind: 'image' | 'audio'; summary: string }) => void;
  /** Wallet, Flutterwave v4 mobile money deposit, cash/pay later, or mobile money */
  onPickPayment?: (method: BookingPaymentMethodChoice) => void;
  disabled?: boolean;
};

function formatTimeLabel(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${h}:${mm} ${ap}`;
}

export function ChatWidgetTray({
  widgets,
  onPickDate,
  onPickTime,
  onMediaAnalyzed,
  onPickPayment,
  disabled,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [pickerValue, setPickerValue] = useState(() => new Date());
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxAudioRef = useRef(45);

  useEffect(() => {
    return () => {
      if (recordTimer.current) clearInterval(recordTimer.current);
      void recording?.stopAndUnloadAsync();
    };
  }, [recording]);

  const stopRecordTimer = () => {
    if (recordTimer.current) {
      clearInterval(recordTimer.current);
      recordTimer.current = null;
    }
  };

  const openPicker = (mode: 'date' | 'time') => {
    setPickerMode(mode);
    setPickerValue(new Date());
    setPickerOpen(true);
  };

  const finalizePicker = useCallback(() => {
    setPickerOpen(false);
    if (pickerMode === 'date') {
      onPickDate(toLocalDateString(pickerValue));
    } else {
      onPickTime(formatTimeLabel(pickerValue));
    }
  }, [onPickDate, onPickTime, pickerMode, pickerValue]);

  const onPickerChange = (_: unknown, selected?: Date) => {
    if (selected) setPickerValue(selected);
    if (Platform.OS === 'android') {
      if (selected) {
        if (pickerMode === 'date') {
          onPickDate(toLocalDateString(selected));
        } else {
          onPickTime(formatTimeLabel(selected));
        }
      }
      setPickerOpen(false);
    }
  };

  const pickPhoto = async () => {
    if (disabled || mediaBusy) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted' && lib.status !== 'granted') {
      return;
    }
    setMediaBusy(true);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
      });
      if (r.canceled || !r.assets?.[0]?.uri) return;
      const asset = r.assets[0];
      const uri = asset.uri;
      const mime = asset.mimeType || 'image/jpeg';
      const name = uri.split('/').pop() || 'photo.jpg';
      const { summary } = await postAssistantChatAttachment('image', uri, mime, name);
      onMediaAnalyzed({ kind: 'image', summary });
    } catch {
      onMediaAnalyzed({
        kind: 'image',
        summary: 'Could not analyze the photo. Try again or describe what you see in text.',
      });
    } finally {
      setMediaBusy(false);
    }
  };

  const takePhoto = async () => {
    if (disabled || mediaBusy) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    setMediaBusy(true);
    try {
      const r = await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: true });
      if (r.canceled || !r.assets?.[0]?.uri) return;
      const asset = r.assets[0];
      const uri = asset.uri;
      const mime = asset.mimeType || 'image/jpeg';
      const name = uri.split('/').pop() || 'capture.jpg';
      const { summary } = await postAssistantChatAttachment('image', uri, mime, name);
      onMediaAnalyzed({ kind: 'image', summary });
    } catch {
      onMediaAnalyzed({
        kind: 'image',
        summary: 'Could not analyze the photo. Try again or describe what you see in text.',
      });
    } finally {
      setMediaBusy(false);
    }
  };

  const startRecording = async (maxSec: number) => {
    if (disabled || mediaBusy) return;
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return;
    maxAudioRef.current = Math.min(60, Math.max(10, maxSec));
    setMediaBusy(true);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setRecordSeconds(0);
      setMediaBusy(false);
      stopRecordTimer();
      recordTimer.current = setInterval(() => {
        setRecordSeconds((s) => {
          const next = s + 1;
          if (next >= maxAudioRef.current) {
            void stopRecordingAndUpload(rec);
          }
          return next;
        });
      }, 1000);
    } catch {
      setMediaBusy(false);
    }
  };

  const stopRecordingAndUpload = async (rec?: Audio.Recording | null) => {
    const r = rec ?? recording;
    stopRecordTimer();
    setRecording(null);
    if (!r) {
      setMediaBusy(false);
      return;
    }
    setMediaBusy(true);
    try {
      await r.stopAndUnloadAsync();
      const uri = r.getURI();
      if (!uri) {
        setMediaBusy(false);
        return;
      }
      const { summary } = await postAssistantChatAttachment('audio', uri, 'audio/m4a', 'recording.m4a');
      onMediaAnalyzed({ kind: 'audio', summary });
    } catch {
      onMediaAnalyzed({
        kind: 'audio',
        summary: 'Could not analyze the recording. Try again or describe the sound in text.',
      });
    } finally {
      setMediaBusy(false);
      setRecordSeconds(0);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  };

  if (!widgets.length) return null;

  return (
    <View style={styles.tray} accessibilityLabel="Assistant suggested inputs">
      {widgets.map((w, i) => (
        <View key={`${w.type}-${i}`} style={styles.block}>
          {w.label ? <Text style={styles.label}>{w.label}</Text> : null}
          {w.hint ? <Text style={styles.hint}>{w.hint}</Text> : null}
          {w.type === 'date_picker' ? (
            <Pressable
              style={[styles.btn, disabled && styles.btnDisabled]}
              onPress={() => openPicker('date')}
              disabled={disabled}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={styles.btnText}>Choose date</Text>
            </Pressable>
          ) : null}
          {w.type === 'time_picker' ? (
            <Pressable
              style={[styles.btn, disabled && styles.btnDisabled]}
              onPress={() => openPicker('time')}
              disabled={disabled}
            >
              <Ionicons name="time-outline" size={20} color={colors.primary} />
              <Text style={styles.btnText}>Choose time</Text>
            </Pressable>
          ) : null}
          {w.type === 'photo_capture' ? (
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.btnHalf, disabled && styles.btnDisabled]} onPress={takePhoto} disabled={disabled || mediaBusy}>
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                <Text style={styles.btnText}>Camera</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnHalf, disabled && styles.btnDisabled]} onPress={pickPhoto} disabled={disabled || mediaBusy}>
                <Ionicons name="images-outline" size={20} color={colors.primary} />
                <Text style={styles.btnText}>Library</Text>
              </Pressable>
            </View>
          ) : null}
          {w.type === 'audio_record' ? (
            <View>
              {!recording ? (
                <Pressable
                  style={[styles.btn, disabled && styles.btnDisabled]}
                  onPress={() => void startRecording(w.max_seconds ?? 45)}
                  disabled={disabled || mediaBusy}
                >
                  <Ionicons name="mic-outline" size={20} color={colors.primary} />
                  <Text style={styles.btnText}>Record sound (engine / noise)</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.btn, styles.recordActive]} onPress={() => void stopRecordingAndUpload()}>
                  <Ionicons name="stop-circle" size={22} color="#fff" />
                  <Text style={styles.btnTextLight}>Stop ({recordSeconds}s)</Text>
                </Pressable>
              )}
            </View>
          ) : null}
          {w.type === 'payment_method_picker' && onPickPayment ? (
            <View style={styles.payGrid}>
              {(
                [
                  { m: 'wallet' as const, icon: 'wallet-outline' as const, t: 'Autexa wallet' },
                  { m: 'card' as const, icon: 'phone-portrait-outline' as const, t: 'MM deposit (Flutterwave)' },
                  { m: 'pay_later' as const, icon: 'receipt-outline' as const, t: 'Cash / pay later' },
                  { m: 'mobile_money' as const, icon: 'phone-portrait-outline' as const, t: 'Mobile money' },
                ] as const
              ).map(({ m, icon, t }) => (
                <Pressable
                  key={m}
                  style={[styles.payChip, disabled && styles.btnDisabled]}
                  disabled={disabled}
                  onPress={() => onPickPayment(m)}
                >
                  <Ionicons name={icon} size={18} color={colors.primaryDark} />
                  <Text style={styles.payChipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {w.type === 'map_focus' ? (
            <Pressable
              style={[styles.btn, disabled && styles.btnDisabled]}
              disabled={disabled}
              onPress={() => {
                const pid = String(w.provider_id || '').trim();
                const lat = typeof w.lat === 'number' ? w.lat : undefined;
                const lng = typeof w.lng === 'number' ? w.lng : undefined;
                navigateToAppStack('Map', pid ? { providerId: pid } : lat != null && lng != null ? { lat, lng } : undefined);
              }}
            >
              <Ionicons name="map-outline" size={20} color={colors.primary} />
              <Text style={styles.btnText}>Open map</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {mediaBusy && !recording ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.busyText}>Working…</Text>
        </View>
      ) : null}

      {pickerOpen && Platform.OS === 'ios' ? (
        <Modal transparent animationType="fade" visible>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <DateTimePicker value={pickerValue} mode={pickerMode} display="spinner" onChange={onPickerChange} />
            <View style={styles.modalActions}>
              <Text style={styles.preview}>
                {pickerMode === 'date' ? formatDateChipLabel(pickerValue) : formatTimeLabel(pickerValue)}
              </Text>
              <Pressable style={styles.doneBtn} onPress={finalizePicker}>
                <Text style={styles.doneBtnText}>Use this {pickerMode === 'date' ? 'date' : 'time'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
      {pickerOpen && Platform.OS === 'android' ? (
        <DateTimePicker value={pickerValue} mode={pickerMode} display="default" onChange={onPickerChange} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.md,
  },
  block: { gap: spacing.xs },
  label: { fontSize: 15, fontWeight: '800', color: colors.text },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnHalf: { flex: 1 },
  btnDisabled: { opacity: 0.45 },
  recordActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  btnText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  btnTextLight: { fontSize: 15, fontWeight: '700', color: '#fff' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  busyText: { fontSize: 14, color: colors.textSecondary },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalActions: { marginTop: spacing.sm, gap: spacing.sm },
  preview: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'center' },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  payGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: '47%',
    flexGrow: 1,
    justifyContent: 'center',
  },
  payChipText: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1 },
});
