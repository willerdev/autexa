import { SchemaType } from '@google/generative-ai';

/**
 * Gemini tool: requests native UI in the mobile app (no server-side effect).
 * Handled in runGeminiChat — not in TOOL_EXECUTORS.
 */
export const EMIT_CHAT_WIDGETS_TOOL = {
  name: 'emit_chat_widgets',
  description: `Shows native controls in the Autexa app so the user can pick values without typing. Call in the same model turn when you ask for that input.
• date_picker — calendar date (booking date, etc.)
• time_picker — time of day
• photo_capture — camera or library for vehicle photos, damage, warning lights, engine bay
• audio_record — short recording for sounds (engine misfire, knock, exhaust, squeal); user holds phone near the source
• payment_method_picker — tap buttons: Autexa wallet, Card (Stripe), Cash/pay later, Mobile money (use when asking how they want to pay)
After the user uses a control, their choice is sent back as text (or analysis) — you do not need to ask them to type the same thing again.`,
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      widgets: {
        type: SchemaType.ARRAY,
        description: 'One or more widgets to show below your message',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            type: {
              type: SchemaType.STRING,
              enum: ['date_picker', 'time_picker', 'photo_capture', 'audio_record', 'payment_method_picker'],
              description: 'Which control to show',
            },
            label: {
              type: SchemaType.STRING,
              description: 'Short title above the control',
            },
            hint: {
              type: SchemaType.STRING,
              description: 'Optional subtitle or guidance',
            },
            max_seconds: {
              type: SchemaType.NUMBER,
              description: 'For audio_record only: max seconds (default 45, max 60)',
            },
          },
          required: ['type'],
        },
      },
    },
    required: ['widgets'],
  },
};
