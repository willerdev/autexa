export type ChatWidgetType =
  | 'date_picker'
  | 'time_picker'
  | 'photo_capture'
  | 'audio_record'
  | 'payment_method_picker'
  | 'map_focus';

export type ChatWidgetSpec = {
  type: ChatWidgetType;
  label?: string;
  hint?: string;
  max_seconds?: number;
  provider_id?: string;
  lat?: number;
  lng?: number;
};
