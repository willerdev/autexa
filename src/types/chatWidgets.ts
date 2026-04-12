export type ChatWidgetType =
  | 'date_picker'
  | 'time_picker'
  | 'photo_capture'
  | 'audio_record'
  | 'payment_method_picker';

export type ChatWidgetSpec = {
  type: ChatWidgetType;
  label?: string;
  hint?: string;
  max_seconds?: number;
};
