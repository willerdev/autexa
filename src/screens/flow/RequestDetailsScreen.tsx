import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { createServiceRequest } from '../../api/serviceRequests';
import { ScreenScroll, TextField } from '../../components';
import type { AppStackParamList } from '../../types';
import { colors, radius, spacing } from '../../theme';
import { getErrorMessage } from '../../lib/errors';

type Props = NativeStackScreenProps<AppStackParamList, 'RequestDetails'>;

const urgencyOptions = [
  { id: 'normal', label: 'Flexible' },
  { id: 'soon', label: 'Today' },
  { id: 'urgent', label: 'Urgent' },
] as const;

export function RequestDetailsScreen({ navigation, route }: Props) {
  const { serviceId, serviceName } = route.params;
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('Current location');
  const [urgency, setUrgency] = useState<(typeof urgencyOptions)[number]['id']>('normal');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await createServiceRequest({
        serviceId,
        description: description.trim(),
        location: location.trim() || 'Not specified',
        urgency,
      });
      if (error) {
        Alert.alert('Could not submit', getErrorMessage(error));
        return;
      }
      navigation.navigate('ProviderList', {
        serviceName,
        description: description.trim() || undefined,
        requestId: data?.id,
      });
    } catch (e) {
      Alert.alert('Could not submit', getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScroll edges={['left', 'right']}>
      <Text style={styles.service}>{serviceName}</Text>
      <Text style={styles.lead}>Tell providers what you need so they can prepare an accurate quote.</Text>

      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Full synthetic oil change, squeak when braking"
        multiline
        style={styles.textArea}
      />
      <TextField
        label="Location"
        value={location}
        onChangeText={setLocation}
        placeholder="Address or use GPS"
      />

      <Text style={styles.label}>Urgency</Text>
      <View style={styles.chips}>
        {urgencyOptions.map((o) => {
          const on = urgency === o.id;
          return (
            <Pressable
              key={o.id}
              onPress={() => setUrgency(o.id)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.submit, submitting && styles.submitDisabled]}
        onPress={() => void submit()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit request</Text>
        )}
      </Pressable>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  service: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  lead: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextOn: {
    color: colors.primaryDark,
  },
  submit: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.85,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
