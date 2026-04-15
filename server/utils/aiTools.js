import { SchemaType } from '@google/generative-ai';
import { normalizeBookingPaymentMethod } from '../src/lib/bookingPayments.js';
import {
  generateBookingBillImage,
  makeBookingPreviewKey,
  consumePendingBookingPreview,
  recordBookingPreviewAck,
  setBillImageForUser,
  mergeBillPreview,
  buildTextReceiptLines,
} from '../src/lib/bookingBillPreview.js';
import { createServiceClient } from '../src/lib/supabase.js';
import * as walletService from '../src/services/walletService.js';
import {
  notifyProviderInAppAndSms,
  notifyUserInAppAndSms,
} from '../src/services/notifyChannels.js';
import { toUgandaE164 } from '../src/lib/phoneE164.js';
import { sendSmsIfConfigured } from '../src/lib/twilioSms.js';
import { requireSmsAccess } from '../src/services/subscriptionsService.js';

function getServiceClient() {
  return createServiceClient();
}

function objectSchema(properties, required = []) {
  return {
    type: SchemaType.OBJECT,
    properties,
    required: required.length ? required : undefined,
  };
}

export function deepMergePreferences(existing, incoming) {
  const merged = { ...(existing && typeof existing === 'object' ? existing : {}) };
  for (const key of Object.keys(incoming || {})) {
    const inc = incoming[key];
    if (Array.isArray(inc) && Array.isArray(merged[key])) {
      const prev = merged[key];
      if (prev.every((x) => typeof x === 'string') && inc.every((x) => typeof x === 'string')) {
        merged[key] = [...new Set([...prev, ...inc])];
      } else {
        merged[key] = [...prev, ...inc];
      }
    } else if (inc !== null && inc !== undefined) {
      merged[key] = inc;
    }
  }
  return merged;
}

/** What Gemini sees — function signatures (OpenAPI-style via SchemaType). */
export const TOOL_DEFINITIONS = [
  {
    name: 'get_user_cars',
    description:
      "Fetches all cars registered by the user. Use when the user asks about their cars, vehicles, garage, or wants service suggestions based on their car.",
    parameters: objectSchema(
      {
        user_id: {
          type: SchemaType.STRING,
          description: 'The authenticated user UUID',
        },
      },
      ['user_id'],
    ),
  },
  {
    name: 'get_user_bookings',
    description:
      'Fetches the user booking history. Use when the user asks about bookings, appointments, past or upcoming services.',
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'The authenticated user UUID' },
        status: {
          type: SchemaType.STRING,
          description: 'Optional filter: pending | confirmed | completed | cancelled. Omit for all.',
          enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        },
        limit: {
          type: SchemaType.INTEGER,
          description: 'Max bookings to return (default 10, max 25).',
        },
      },
      ['user_id'],
    ),
  },
  {
    name: 'get_car_service_history',
    description:
      'Fetches service history for a specific car (completed work). Use for “last oil change”, maintenance history, etc.',
    parameters: objectSchema(
      {
        car_id: { type: SchemaType.STRING, description: 'The car UUID' },
        user_id: { type: SchemaType.STRING, description: 'Must match the car owner for security' },
      },
      ['car_id', 'user_id'],
    ),
  },
  {
    name: 'get_available_services',
    description:
      'Fetches marketplace services Autexa lists. Use when the user asks what services exist or what you can book.',
    parameters: objectSchema({
      search: { type: SchemaType.STRING, description: 'Optional keyword to filter by service name' },
      category: { type: SchemaType.STRING, description: 'Optional category filter' },
    }),
  },
  {
    name: 'get_providers',
    description:
      'Fetches service providers. Use when the user asks for mechanics, garages, or who can perform a service.',
    parameters: objectSchema({
      service_name: {
        type: SchemaType.STRING,
        description: 'Optional: filter providers whose service_type matches this (e.g. Mechanic, Car Wash)',
      },
      location: { type: SchemaType.STRING, description: 'Optional: substring match on provider location text' },
    }),
  },
  {
    name: 'get_user_profile',
    description:
      "Fetches the user's profile (name, contact), saved AI preferences, and learned_memories (id + text) for forget_learned_memory. Use for “what's my name”, account details, or refreshing memories mid-thread.",
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'The authenticated user UUID' },
      },
      ['user_id'],
    ),
  },
  {
    name: 'update_user_profile',
    description: `Updates the authenticated user's profile fields (name, phone). Use ONLY after the user explicitly confirms the exact changes.
Never store secrets. Do not change other fields.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'The authenticated user UUID' },
        name: { type: SchemaType.STRING, description: 'Optional new name' },
        phone: { type: SchemaType.STRING, description: 'Optional new phone number (Uganda recommended)' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'Must be true only after the user clearly confirmed this profile update.',
        },
      },
      ['user_id', 'user_confirmed'],
    ),
  },
  {
    name: 'get_provider_services',
    description:
      'Fetches active services posted by a specific provider (provider dashboard listings).',
    parameters: objectSchema(
      {
        provider_id: { type: SchemaType.STRING, description: 'The provider UUID' },
      },
      ['provider_id'],
    ),
  },
  {
    name: 'discover_services',
    description: `Discovers all active provider-posted services on the platform (any category: food, automotive, cleaning, etc.).
Use when the user asks what is available, what they can order, or whether Autexa offers something specific.
Always call this before assuming a service does or does not exist — providers add new listings anytime.`,
    parameters: objectSchema({
      keyword: {
        type: SchemaType.STRING,
        description: 'Search in title/description/tags e.g. "burger", "oil change", "cleaning"',
      },
      service_type: {
        type: SchemaType.STRING,
        description: 'Filter: automotive | food | cleaning | general (or custom type slug)',
      },
      location: {
        type: SchemaType.STRING,
        description: 'Substring match on provider location text e.g. "Kampala"',
      },
    }),
  },
  {
    name: 'get_service_details',
    description: `Full details for one provider service: pricing, metadata (menu, etc.), provider, and booking requirements.
Use after the user picks a service or asks for menu, what is included, or prep time.`,
    parameters: objectSchema(
      {
        service_id: { type: SchemaType.STRING, description: 'provider_services.id UUID' },
      },
      ['service_id'],
    ),
  },
  {
    name: 'get_service_type_schema',
    description: `Returns booking_fields and metadata_schema for a service_type so you know what to ask before booking.
Use before collecting slot-filling details, especially for unfamiliar types.`,
    parameters: objectSchema(
      {
        service_type: { type: SchemaType.STRING, description: 'e.g. food, automotive, cleaning, general' },
      },
      ['service_type'],
    ),
  },
  {
    name: 'get_user_preferences',
    description: `Learned preferences for this user (usual order, dietary notes, preferred time, etc.).
Call before personalising offers.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        service_type: { type: SchemaType.STRING, description: 'e.g. food, automotive' },
        provider_id: { type: SchemaType.STRING, description: 'Optional: scope to one provider' },
      },
      ['user_id', 'service_type'],
    ),
  },
  {
    name: 'save_user_preferences',
    description: `Merge and save learned preferences after booking or when the user states likes/dislikes.
Do not store card numbers or passwords.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        service_type: { type: SchemaType.STRING, description: 'e.g. food' },
        provider_id: { type: SchemaType.STRING, description: 'Optional provider UUID' },
        preferences: {
          type: SchemaType.OBJECT,
          description: 'Flexible JSON e.g. liked_items, dietary, usual_order, preferred_time',
        },
      },
      ['user_id', 'service_type', 'preferences'],
    ),
  },
  {
    name: 'get_payment_method_options',
    description: `Returns supported booking payment methods for Autexa. Use when the user must choose how to pay. Always offer: wallet (in-app UGX), mobile_money (Flutterwave v4 UG MM push for deposit), cash/pay_later (pay on arrival or later), card (legacy label; same as mobile_money deposit in app). Then call emit_chat_widgets with payment_method_picker or list options as numbered choices in text.`,
    parameters: objectSchema({}),
  },
  {
    name: 'preview_booking_bill',
    description: `Generates a visual bill/receipt image (Google Imagen) in the app chat so the customer can review before the booking is saved. MUST be called with the same fields you will use for create_dynamic_booking, after the user confirms the booking summary. Call this immediately before create_dynamic_booking in the flow.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        provider_service_id: { type: SchemaType.STRING, description: 'provider_services.id' },
        provider_id: { type: SchemaType.STRING, description: 'Must match the listing provider' },
        service_name: { type: SchemaType.STRING, description: 'Human-readable title' },
        service_type: { type: SchemaType.STRING, description: 'Type slug e.g. food' },
        booking_date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
        booking_time: { type: SchemaType.STRING, description: 'Time string e.g. 2:00 PM' },
        booking_details: {
          type: SchemaType.OBJECT,
          description: 'Same object you will pass to create_dynamic_booking',
        },
        payment_method: {
          type: SchemaType.STRING,
          description: 'card | wallet | pay_later (cash) | mobile_money — use user choice',
        },
        estimated_total: { type: SchemaType.NUMBER, description: 'Total in dollars (major units), optional' },
      },
      [
        'user_id',
        'provider_service_id',
        'provider_id',
        'service_name',
        'service_type',
        'booking_date',
        'booking_time',
        'booking_details',
      ],
    ),
  },
  {
    name: 'create_dynamic_booking',
    description: `Create a booking ONLY after preview_booking_bill was called with identical provider_service_id, provider_id, service_name, booking_date, booking_time, and estimated_total. Pass booking_date as YYYY-MM-DD and booking_time as text (e.g. "6:00 PM").
estimated_total is in major currency units (e.g. USD dollars); server converts to cents.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        provider_service_id: { type: SchemaType.STRING, description: 'provider_services.id' },
        provider_id: { type: SchemaType.STRING, description: 'Must match the listing provider' },
        service_name: { type: SchemaType.STRING, description: 'Human-readable title' },
        service_type: { type: SchemaType.STRING, description: 'Type slug e.g. food' },
        booking_date: { type: SchemaType.STRING, description: 'YYYY-MM-DD' },
        booking_time: { type: SchemaType.STRING, description: 'Time string e.g. 2:00 PM' },
        booking_details: {
          type: SchemaType.OBJECT,
          description: 'Type-specific payload: selected_items, delivery_address, car_id, notes, etc.',
        },
        payment_method: {
          type: SchemaType.STRING,
          description: 'card (legacy) | wallet | pay_later (cash / pay later) | mobile_money (Flutterwave v4)',
        },
        estimated_total: { type: SchemaType.NUMBER, description: 'Total in dollars (major units), optional' },
      },
      [
        'user_id',
        'provider_service_id',
        'provider_id',
        'service_name',
        'service_type',
        'booking_date',
        'booking_time',
        'booking_details',
      ],
    ),
  },
  {
    name: 'cancel_user_bookings',
    description: `Cancel one or many of the user's own bookings (sets status to cancelled). Use after listing bookings and getting explicit confirmation (e.g. user said yes, confirm, all of them). For bulk, pass every booking id to cancel. Skips ids that are not found, already cancelled, or completed.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        booking_ids: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'One or more booking UUIDs belonging to this user',
        },
        reason: {
          type: SchemaType.STRING,
          description: 'Optional cancellation reason; omit or use a short default if user did not specify',
        },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description:
            'Must be true only after the user explicitly confirmed this cancellation in chat (e.g. yes, confirm, proceed, all of them). If false, do not call — ask for confirmation first.',
        },
      },
      ['user_id', 'booking_ids', 'user_confirmed'],
    ),
  },
  {
    name: 'update_user_booking',
    description: `Reschedule or adjust an existing booking (date, time, and/or payment method). Only for bookings owned by the user. Confirm changes with the user before calling when the change is significant.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        booking_id: { type: SchemaType.STRING, description: 'Booking UUID' },
        date: { type: SchemaType.STRING, description: 'Optional new date YYYY-MM-DD' },
        time: { type: SchemaType.STRING, description: 'Optional new time text e.g. 2:00 PM' },
        payment_method: {
          type: SchemaType.STRING,
          description: 'Optional: card | wallet | pay_later | mobile_money',
          enum: ['card', 'wallet', 'pay_later', 'mobile_money'],
        },
      },
      ['user_id', 'booking_id'],
    ),
  },
  {
    name: 'delete_user_car',
    description: `Permanently removes a car from the user's garage. Destructive — only after explicit user confirmation.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        car_id: { type: SchemaType.STRING, description: 'Car UUID to delete' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'Must be true only after the user explicitly confirmed deleting this vehicle.',
        },
      },
      ['user_id', 'car_id', 'user_confirmed'],
    ),
  },
  {
    name: 'get_wallet_balance',
    description: `Gets the user's Autexa wallet balance (UGX). Use for "what's my balance?", "how much in my wallet?", "can I afford X?". Always check before pay_provider_from_wallet.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
      },
      ['user_id'],
    ),
  },
  {
    name: 'get_transaction_history',
    description: `Lists recent wallet transactions (top-ups, withdrawals, payments, transfers). Use for spending history, recent payments.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        type: {
          type: SchemaType.STRING,
          description: 'Optional filter',
          enum: ['topup', 'withdrawal', 'payment', 'booking_payment', 'transfer', 'refund'],
        },
        limit: { type: SchemaType.INTEGER, description: 'Max rows (default 10, max 25)' },
      },
      ['user_id'],
    ),
  },
  {
    name: 'lookup_provider_wallet_user',
    description: `Resolves a provider row id (public.providers.id) to the provider's auth user_id needed for wallet transfers. Call before pay_provider_from_wallet when you only know provider id from bookings.`,
    parameters: objectSchema(
      {
        provider_id: { type: SchemaType.STRING, description: 'providers.id UUID' },
      },
      ['provider_id'],
    ),
  },
  {
    name: 'pay_provider_from_wallet',
    description: `Moves UGX from the customer's wallet to the provider's wallet. Requires provider auth user_id (use lookup_provider_wallet_user from provider_id). NEVER call without explicit user confirmation ("yes", "confirm", "pay now"). Always get_wallet_balance first. Amount is in UGX.`,
    parameters: objectSchema(
      {
        from_user_id: { type: SchemaType.STRING, description: 'Paying customer UUID' },
        to_user_id: { type: SchemaType.STRING, description: "Provider's auth user UUID (not providers.id)" },
        amount: { type: SchemaType.NUMBER, description: 'UGX amount' },
        booking_id: { type: SchemaType.STRING, description: 'Optional booking UUID' },
        description: { type: SchemaType.STRING, description: 'Short payment description' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'Must be true only after explicit pay confirmation in chat.',
        },
      },
      ['from_user_id', 'to_user_id', 'amount', 'description', 'user_confirmed'],
    ),
  },
  {
    name: 'list_wallet_payees',
    description: `Lists saved people/providers the user can pay from their wallet (from the app payee list). Use when they say "who can I send money to", "my payees", "saved contacts".`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
      },
      ['user_id'],
    ),
  },
  {
    name: 'add_wallet_payee',
    description: `Adds someone to the user's saved wallet payee list. Provide either provider_id (public.providers.id) OR payee_user_id (another user's auth UUID), plus a short label. Only after the user clearly confirms.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        label: { type: SchemaType.STRING, description: 'Display name e.g. "Joe\'s Garage"' },
        provider_id: { type: SchemaType.STRING, description: 'Optional providers.id if adding a provider' },
        payee_user_id: { type: SchemaType.STRING, description: 'Optional other user auth UUID if not using provider_id' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after user explicitly confirms adding this payee.',
        },
      },
      ['user_id', 'label', 'user_confirmed'],
    ),
  },
  {
    name: 'remove_wallet_payee',
    description: `Removes an entry from the saved payee list. Requires payee row id from list_wallet_payees. Confirm first.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        payee_id: { type: SchemaType.STRING, description: 'wallet_payees.id UUID' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after explicit confirmation.',
        },
      },
      ['user_id', 'payee_id', 'user_confirmed'],
    ),
  },
  {
    name: 'send_to_wallet_payee',
    description: `Sends UGX from the user's wallet to a saved payee. Use payee id from list_wallet_payees. Always get_wallet_balance first; confirm amount and recipient; then user_confirmed: true.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        payee_id: { type: SchemaType.STRING, description: 'wallet_payees.id from list_wallet_payees' },
        amount: { type: SchemaType.NUMBER, description: 'UGX amount' },
        description: { type: SchemaType.STRING, description: 'Optional short note' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after explicit pay confirmation.',
        },
      },
      ['user_id', 'payee_id', 'amount', 'user_confirmed'],
    ),
  },
  {
    name: 'withdraw_to_mobile_money',
    description: `Withdraws UGX from the Autexa wallet to the user's Uganda mobile money account via Flutterwave. High impact: confirm amount and full phone number; for network use mtn, airtel, or auto (auto infers MTN/Airtel from the number prefix). user_confirmed: true only after clear yes. Check balance first.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        amount: { type: SchemaType.NUMBER, description: 'UGX to receive on phone (fees apply)' },
        phone: { type: SchemaType.STRING, description: 'Mobile money MSISDN e.g. 256...' },
        provider: {
          type: SchemaType.STRING,
          description: 'mtn, airtel, or auto (default — inferred from Uganda number prefix when possible)',
        },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after explicit confirmation.',
        },
      },
      ['user_id', 'amount', 'phone', 'user_confirmed'],
    ),
  },
  {
    name: 'save_wallet_ai_memory',
    description: `Saves a short wallet-related note the user wants Autexa to remember (e.g. preferred withdraw number, reminders). Confirm before saving; keep text short; no card numbers or passwords.`,
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        note: { type: SchemaType.STRING, description: 'Plain text note (max ~500 chars recommended)' },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after user confirms saving this note.',
        },
      },
      ['user_id', 'note', 'user_confirmed'],
    ),
  },
  {
    name: 'save_learned_memory',
    description:
      'Saves one short fact or preference the user asked to remember for future chats (e.g. “always suggest nearest provider”, “I prefer pay later”, corrections). Call ONLY after the user clearly confirms. One atomic memory per call; no secrets, card numbers, passwords, or national IDs.',
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        memory_text: {
          type: SchemaType.STRING,
          description: 'Single concise sentence or phrase (max ~400 chars).',
        },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'True only after explicit user confirmation to save this memory.',
        },
      },
      ['user_id', 'memory_text', 'user_confirmed'],
    ),
  },
  {
    name: 'forget_learned_memory',
    description:
      'Deletes one saved memory by id when the user says it is wrong or they want it forgotten. Use the id from the learnedMemories list in context.',
    parameters: objectSchema(
      {
        user_id: { type: SchemaType.STRING, description: 'Authenticated user UUID' },
        memory_id: { type: SchemaType.STRING, description: 'UUID of the memory row to delete' },
      },
      ['user_id', 'memory_id'],
    ),
  },
  {
    name: 'send_uganda_sms',
    description: `Send one SMS to a Uganda mobile only (Twilio). phone_number and message come from the conversation (user-stated or clearly inferred).
Supported formats: 0XXXXXXXXX (10 digits), 256XXXXXXXXX (12 digits), +256XXXXXXXXX. Not for other countries.
Workflow: (1) If the user only says they want to text/SMS someone, ask for the Uganda number and the message text — do NOT call this tool yet. (2) Recap both, ask for yes to send. (3) Only after they confirm, call with user_confirmed: true.
Do not send marketing without clear consent; never put passwords, card numbers, or full national IDs in the message.`,
    parameters: objectSchema(
      {
        phone_number: {
          type: SchemaType.STRING,
          description: 'Uganda mobile, e.g. 0771234567 or +256771234567',
        },
        message: {
          type: SchemaType.STRING,
          description: 'Plain-text SMS body; keep concise (under ~320 chars for a single segment when possible)',
        },
        user_confirmed: {
          type: SchemaType.BOOLEAN,
          description: 'Must be true only after the user clearly said yes / confirmed to send this SMS.',
        },
      },
      ['phone_number', 'message', 'user_confirmed'],
    ),
  },
];

/** Real DB access — service role; always scope by user_id where applicable. */
export const TOOL_EXECUTORS = {
  get_user_cars: async ({ user_id }) => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('cars')
      .select('id, make, model, year, plate, created_at, updated_at')
      .eq('user_id', user_id)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`get_user_cars failed: ${error.message}`);
    return data ?? [];
  },

  get_user_bookings: async ({ user_id, status, limit }) => {
    const supabase = getServiceClient();
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 25);
    let q = supabase
      .from('bookings')
      .select(
        'id, date, time, status, service_name, provider_id, payment_status, payment_method, amount_cents, cancel_reason, cancelled_at, providers(name)',
      )
      .eq('user_id', user_id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(lim);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw new Error(`get_user_bookings failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: row.id,
      date: row.date,
      time: row.time,
      status: row.status,
      service_name: row.service_name,
      provider_id: row.provider_id,
      provider_name: row.providers?.name ?? null,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
      amount_cents: row.amount_cents,
      cancel_reason: row.cancel_reason,
      cancelled_at: row.cancelled_at,
    }));
  },

  get_car_service_history: async ({ car_id, user_id }) => {
    const supabase = getServiceClient();
    const { data: car, error: carError } = await supabase
      .from('cars')
      .select('id')
      .eq('id', car_id)
      .eq('user_id', user_id)
      .maybeSingle();
    if (carError) throw new Error(`get_car_service_history: ${carError.message}`);
    if (!car) throw new Error('Car not found or does not belong to this user');

    const { data, error } = await supabase
      .from('car_service_history')
      .select('service_name, provider_name, cost, notes, serviced_at, booking_id')
      .eq('car_id', car_id)
      .eq('user_id', user_id)
      .order('serviced_at', { ascending: false });
    if (error) {
      if (/car_service_history/.test(error.message) || error.code === '42P01') {
        return [];
      }
      throw new Error(`get_car_service_history failed: ${error.message}`);
    }
    return data ?? [];
  },

  get_available_services: async ({ search, category }) => {
    const supabase = getServiceClient();
    let q = supabase.from('services').select('id, name, category, slug').order('name').limit(25);
    if (search && String(search).trim()) {
      q = q.ilike('name', `%${String(search).trim()}%`);
    }
    if (category && String(category).trim()) {
      q = q.ilike('category', `%${String(category).trim()}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`get_available_services failed: ${error.message}`);
    return data ?? [];
  },

  get_providers: async ({ service_name, location }) => {
    const supabase = getServiceClient();
    let q = supabase
      .from('providers')
      .select('id, name, service_type, rating, location, is_available, base_price_cents')
      .eq('is_available', true)
      .order('rating', { ascending: false })
      .limit(15);
    if (location && String(location).trim()) {
      q = q.ilike('location', `%${String(location).trim()}%`);
    }
    if (service_name && String(service_name).trim()) {
      const t = String(service_name).trim();
      q = q.or(`service_type.ilike.%${t}%,name.ilike.%${t}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`get_providers failed: ${error.message}`);
    return data ?? [];
  },

  get_user_profile: async ({ user_id }) => {
    const supabase = getServiceClient();
    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('id, name, email, phone, role')
      .eq('id', user_id)
      .maybeSingle();
    if (uErr) throw new Error(`get_user_profile failed: ${uErr.message}`);
    const { data: ai } = await supabase
      .from('user_ai_context')
      .select('preferred_payment, preferred_location, notes')
      .eq('user_id', user_id)
      .maybeSingle();
    const { data: memRows, error: memErr } = await supabase
      .from('user_ai_learned_memories')
      .select('id,body,created_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(40);
    const learned_memories =
      memErr || !memRows
        ? []
        : memRows.map((r) => ({
            id: r.id,
            text: String(r.body ?? '').slice(0, 500),
            created_at: r.created_at,
          }));
    const name = (u?.name ?? '').trim();
    const parts = name ? name.split(/\s+/) : [];
    return {
      id: u?.id ?? user_id,
      first_name: parts[0] ?? '',
      last_name: parts.slice(1).join(' ') || '',
      email: u?.email ?? null,
      phone: u?.phone ?? null,
      role: u?.role ?? null,
      preferred_payment: ai?.preferred_payment ?? null,
      preferred_location: ai?.preferred_location ?? null,
      ai_notes: ai?.notes ?? null,
      learned_memories,
    };
  },

  update_user_profile: async ({ user_id, name, phone, user_confirmed }) => {
    if (!user_confirmed) {
      return { error: 'Confirmation required. Ask the user to confirm before updating their profile.' };
    }
    const supabase = getServiceClient();
    const uid = String(user_id || '').trim();
    if (!uid) return { error: 'user_id is required' };

    const patch = {};
    if (typeof name === 'string' && name.trim()) {
      patch.name = name.trim().slice(0, 120);
    }
    if (typeof phone === 'string') {
      const raw = phone.trim();
      if (raw) {
        const normalized = toUgandaE164(raw) || raw;
        patch.phone = String(normalized).slice(0, 32);
      }
    }
    if (!Object.keys(patch).length) {
      return { error: 'No changes provided. Provide name and/or phone.' };
    }

    const { error } = await supabase.from('users').update(patch).eq('id', uid);
    if (error) throw new Error(`update_user_profile failed: ${error.message}`);

    const { data: u, error: uErr } = await supabase
      .from('users')
      .select('id,name,email,phone,role')
      .eq('id', uid)
      .maybeSingle();
    if (uErr) throw new Error(`update_user_profile readback failed: ${uErr.message}`);
    return { ok: true, user: u ?? null };
  },

  get_provider_services: async ({ provider_id }) => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('provider_services')
      .select(
        'id, title, description, price_cents, category_id, is_active, views_count, created_at, service_type, tags, metadata',
      )
      .eq('provider_id', provider_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw new Error(`get_provider_services failed: ${error.message}`);
    return data ?? [];
  },

  discover_services: async ({ keyword, service_type, location }) => {
    const supabase = getServiceClient();
    let q = supabase
      .from('provider_services')
      .select(
        'id, title, description, price_cents, service_type, tags, metadata, provider_id, providers ( id, name, location, rating, service_type )',
      )
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(40);

    const st = service_type ? String(service_type).trim().toLowerCase() : '';
    if (st) q = q.eq('service_type', st);

    const kw = keyword ? String(keyword).trim().replace(/%/g, '') : '';

    const { data, error } = await q.order('updated_at', { ascending: false }).limit(80);
    if (error) throw new Error(`discover_services failed: ${error.message}`);

    const loc = location ? String(location).trim().toLowerCase() : '';
    let rows = data ?? [];
    if (kw) {
      const k = kw.toLowerCase();
      rows = rows.filter((s) => {
        const tagHit = (s.tags ?? []).some((t) => String(t).toLowerCase().includes(k));
        const titleHit = (s.title ?? '').toLowerCase().includes(k);
        const descHit = (s.description ?? '').toLowerCase().includes(k);
        return tagHit || titleHit || descHit;
      });
    }
    if (loc) {
      rows = rows.filter((s) => (s.providers?.location ?? '').toLowerCase().includes(loc));
    }

    return rows.slice(0, 15).map((s) => {
      const menu = s.metadata && typeof s.metadata === 'object' ? s.metadata.menu : null;
      const menuPreview =
        s.service_type === 'food' && Array.isArray(menu)
          ? menu.filter((i) => i && i.available !== false).map((i) => i.name).filter(Boolean).slice(0, 8)
          : null;
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        price_cents: s.price_cents,
        service_type: s.service_type,
        tags: s.tags,
        menu_preview: menuPreview,
        provider: s.providers
          ? {
              id: s.providers.id,
              name: s.providers.name,
              location: s.providers.location,
              rating: s.providers.rating != null ? Number(s.providers.rating) : null,
            }
          : null,
      };
    });
  },

  get_service_details: async ({ service_id }) => {
    const supabase = getServiceClient();
    const { data: service, error } = await supabase
      .from('provider_services')
      .select(
        'id, title, description, price_cents, service_type, tags, metadata, provider_id, providers ( id, name, location, rating, service_type )',
      )
      .eq('id', service_id)
      .maybeSingle();
    if (error) throw new Error(`get_service_details failed: ${error.message}`);
    if (!service) throw new Error('Service not found');

    const st = String(service.service_type ?? 'general').toLowerCase();
    const { data: schema } = await supabase
      .from('service_type_schemas')
      .select('booking_fields, metadata_schema, display_name, description')
      .eq('service_type', st)
      .maybeSingle();

    const fullMenu = st === 'food' && service.metadata && Array.isArray(service.metadata.menu) ? service.metadata.menu : null;

    return {
      ...service,
      booking_requirements:
        schema?.booking_fields ?? ({ required: ['date', 'time'], optional: ['notes'] }),
      metadata_schema: schema?.metadata_schema ?? { fields: [] },
      type_display_name: schema?.display_name ?? st,
      type_description: schema?.description ?? null,
      full_menu: fullMenu,
    };
  },

  get_service_type_schema: async ({ service_type }) => {
    const supabase = getServiceClient();
    const st = String(service_type ?? 'general').trim().toLowerCase();
    const { data, error } = await supabase
      .from('service_type_schemas')
      .select('*')
      .eq('service_type', st)
      .maybeSingle();

    if (error) throw new Error(`get_service_type_schema failed: ${error.message}`);
    if (!data) {
      return {
        service_type: st,
        booking_fields: { required: ['date', 'time'], optional: ['notes'] },
        metadata_schema: { fields: [] },
        note: 'Generic schema — collect date, time, and any details the provider would need.',
      };
    }
    return data;
  },

  get_user_preferences: async ({ user_id, service_type, provider_id }) => {
    const supabase = getServiceClient();
    let q = supabase
      .from('user_service_preferences')
      .select('preferences, interaction_count, last_interaction, provider_id, updated_at')
      .eq('user_id', user_id)
      .eq('service_type', String(service_type).trim());

    if (provider_id) q = q.eq('provider_id', provider_id);
    else q = q.is('provider_id', null);

    const { data, error } = await q.order('updated_at', { ascending: false }).limit(1);
    if (error) throw new Error(`get_user_preferences failed: ${error.message}`);
    const row = data?.[0];
    if (!row) {
      return { found: false, message: 'No preferences saved yet for this user and service type.' };
    }
    return {
      found: true,
      preferences: row.preferences,
      interactions: row.interaction_count,
      last_interaction: row.last_interaction,
      provider_id: row.provider_id,
    };
  },

  save_user_preferences: async ({ user_id, service_type, provider_id, preferences }) => {
    const supabase = getServiceClient();
    const st = String(service_type).trim();
    const pid = provider_id ? String(provider_id) : null;

    let q = supabase
      .from('user_service_preferences')
      .select('id, preferences, interaction_count')
      .eq('user_id', user_id)
      .eq('service_type', st);
    if (pid) q = q.eq('provider_id', pid);
    else q = q.is('provider_id', null);

    const { data: existingRows, error: selErr } = await q.order('updated_at', { ascending: false }).limit(1);
    if (selErr) throw new Error(selErr.message);

    const existing = existingRows?.[0];
    const mergedPreferences = deepMergePreferences(existing?.preferences ?? {}, preferences ?? {});
    const nextCount = (existing?.interaction_count ?? 0) + 1;
    const now = new Date().toISOString();

    if (existing?.id) {
      const { error: upErr } = await supabase
        .from('user_service_preferences')
        .update({
          preferences: mergedPreferences,
          interaction_count: nextCount,
          last_interaction: now,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: insErr } = await supabase.from('user_service_preferences').insert({
        user_id,
        service_type: st,
        provider_id: pid,
        preferences: mergedPreferences,
        interaction_count: 1,
        last_interaction: now,
        updated_at: now,
      });
      if (insErr) throw new Error(insErr.message);
    }

    return { success: true, saved_preferences: mergedPreferences };
  },

  get_payment_method_options: async () => ({
    options: [
      { id: 'wallet', label: 'Autexa wallet', db_value: 'wallet', hint: 'UGX balance in the app' },
      { id: 'card', label: 'Mobile money deposit', db_value: 'card', hint: 'Flutterwave v4 — approve on phone' },
      { id: 'pay_later', label: 'Cash / pay later', db_value: 'pay_later', hint: 'Pay on arrival or later' },
      { id: 'mobile_money', label: 'Mobile money', db_value: 'mobile_money', hint: 'UG mobile money via Flutterwave' },
    ],
    aliases: { cash: 'pay_later', stripe: 'card', credit: 'card', debit: 'card', later: 'pay_later' },
    ui_hint:
      'In the same turn you ask how they want to pay, call emit_chat_widgets with widgets: [{ type: "payment_method_picker", label: "How would you like to pay?" }].',
  }),

  preview_booking_bill: async ({
    user_id,
    provider_service_id,
    provider_id,
    service_name,
    service_type,
    booking_date,
    booking_time,
    booking_details,
    payment_method,
    estimated_total,
  }) => {
    const supabase = getServiceClient();
    const { data: listing, error: lErr } = await supabase
      .from('provider_services')
      .select('id, provider_id, title')
      .eq('id', provider_service_id)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!listing) throw new Error('provider_service not found');
    if (String(listing.provider_id) !== String(provider_id)) {
      throw new Error('provider_id does not match this listing');
    }

    const { data: provRow } = await supabase
      .from('providers')
      .select('name')
      .eq('id', listing.provider_id)
      .maybeSingle();

    const key = makeBookingPreviewKey({
      provider_service_id,
      provider_id,
      booking_date,
      booking_time,
      estimated_total,
      service_name,
    });
    recordBookingPreviewAck(user_id, key);

    const providerName = provRow?.name ?? 'Provider';
    const svc = service_name || listing.title || 'Service';
    const totalLabel =
      estimated_total != null && Number.isFinite(Number(estimated_total))
        ? `$${Number(estimated_total).toFixed(2)} USD estimated`
        : 'Total to be confirmed';

    const lines = buildTextReceiptLines({
      serviceName: svc,
      providerName,
      bookingDate: String(booking_date).trim(),
      bookingTime: String(booking_time).trim(),
      totalLabel,
      paymentMethodRaw: payment_method || 'card',
    });
    mergeBillPreview(user_id, { textReceipt: { title: 'Autexa booking bill', lines } });

    try {
      const img = await generateBookingBillImage({
        serviceName: svc,
        providerName,
        bookingDate: String(booking_date).trim(),
        bookingTime: String(booking_time).trim(),
        totalLabel,
        paymentMethod: payment_method || 'card',
      });
      setBillImageForUser(user_id, img.base64, img.mimeType);
      return {
        success: true,
        bill_image_in_chat: true,
        bill_text_in_chat: true,
        service_type: String(service_type ?? 'general'),
        receipt_lines: lines,
        message:
          'Bill preview (text + image when available) is shown in the chat. Ask the user to confirm so you can call create_dynamic_booking with the same details.',
      };
    } catch (e) {
      const msg = e?.message || String(e);
      return {
        success: true,
        bill_image_in_chat: false,
        bill_text_in_chat: true,
        service_type: String(service_type ?? 'general'),
        imagen_error: msg,
        receipt_lines: lines,
        message: `Text bill is in the chat. Image failed (${msg}). Ask the user to confirm before create_dynamic_booking.`,
      };
    }
  },

  create_dynamic_booking: async ({
    user_id,
    provider_service_id,
    provider_id,
    service_name,
    service_type,
    booking_date,
    booking_time,
    booking_details,
    payment_method,
    estimated_total,
  }) => {
    const supabase = getServiceClient();

    const previewKey = makeBookingPreviewKey({
      provider_service_id,
      provider_id,
      booking_date,
      booking_time,
      estimated_total,
      service_name,
    });
    if (!consumePendingBookingPreview(user_id, previewKey)) {
      throw new Error(
        'Call preview_booking_bill first with the same provider_service_id, provider_id, service_name, booking_date, booking_time, and estimated_total so the customer can review the bill.',
      );
    }

    const { data: listing, error: lErr } = await supabase
      .from('provider_services')
      .select('id, provider_id, title')
      .eq('id', provider_service_id)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!listing) throw new Error('provider_service not found');
    if (String(listing.provider_id) !== String(provider_id)) {
      throw new Error('provider_id does not match this listing');
    }

    const usePay = normalizeBookingPaymentMethod(payment_method || 'card');

    let amountCents = null;
    if (estimated_total != null && Number.isFinite(Number(estimated_total))) {
      amountCents = Math.round(Number(estimated_total) * 100);
    }

    const meta = {
      service_type: String(service_type ?? 'general'),
      booking_details: booking_details && typeof booking_details === 'object' ? booking_details : {},
    };

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id,
        provider_id,
        service_name: service_name || listing.title,
        date: String(booking_date).trim(),
        time: String(booking_time).trim(),
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: usePay,
        amount_cents: amountCents,
        provider_service_id,
        metadata: meta,
      })
      .select('id, date, time, status, service_name, provider_id, amount_cents, payment_method')
      .single();

    if (bookingError) throw new Error(`Booking creation failed: ${bookingError.message}`);

    await notifyUserInAppAndSms(supabase, {
      userId: user_id,
      title: 'Booking created',
      body: `${booking.service_name} on ${booking.date} at ${booking.time}.`,
      data: {
        booking_id: booking.id,
        provider_id: booking.provider_id,
        service_name: booking.service_name,
        date: booking.date,
        time: booking.time,
        payment_method: booking.payment_method,
      },
    });
    await notifyProviderInAppAndSms(supabase, {
      providerId: provider_id,
      title: 'New booking',
      body: `${booking.service_name} · ${booking.date} ${booking.time}`,
    });

    const st = String(service_type ?? '').toLowerCase();
    const items = booking_details?.selected_items;
    if (st === 'food' && Array.isArray(items) && items.length > 0) {
      const rows = items.map((item) => ({
        booking_id: booking.id,
        item_name: String(item.name ?? 'Item'),
        unit_price: item.price != null ? Number(item.price) : null,
        quantity: item.quantity != null ? Math.max(1, Math.floor(Number(item.quantity))) : 1,
        item_metadata: {
          notes: item.notes ?? null,
          category: item.category ?? null,
        },
      }));
      const { error: biErr } = await supabase.from('booking_items').insert(rows);
      if (biErr) throw new Error(`booking_items failed: ${biErr.message}`);
    }

    return {
      success: true,
      booking_id: booking.id,
      message: `Booking recorded for ${booking.service_name} on ${booking.date} at ${booking.time}.`,
      booking,
    };
  },

  cancel_user_bookings: async ({ user_id, booking_ids, reason, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. Ask the user to confirm which bookings to cancel, then call again with user_confirmed: true.',
      };
    }
    const supabase = getServiceClient();
    const ids = Array.isArray(booking_ids) ? [...new Set(booking_ids.map((x) => String(x).trim()).filter(Boolean))] : [];
    if (!ids.length) {
      return { error: 'booking_ids must be a non-empty array of UUIDs' };
    }

    const defaults = [
      'Change of plans',
      'Found another provider',
      'Scheduling conflict',
      'Booked by mistake',
      'No longer needed',
    ];
    const provided = reason != null ? String(reason).trim() : '';
    const why =
      provided && provided.toLowerCase() !== 'skip'
        ? provided
        : defaults[Math.floor(Math.random() * defaults.length)];

    const { data: rows, error: selErr } = await supabase
      .from('bookings')
      .select('id, status, date, time, service_name, provider_id')
      .eq('user_id', user_id)
      .in('id', ids);
    if (selErr) throw new Error(`cancel_user_bookings: ${selErr.message}`);

    const terminal = new Set(['cancelled', 'completed']);
    const eligible = (rows ?? []).filter((r) => !terminal.has(String(r.status ?? '').toLowerCase()));
    const skipped = (rows ?? []).filter((r) => terminal.has(String(r.status ?? '').toLowerCase()));
    const missing = ids.filter((id) => !(rows ?? []).some((r) => String(r.id) === id));

    if (!eligible.length) {
      return {
        cancelled_count: 0,
        message: 'No active bookings could be cancelled (already finished/cancelled or not found).',
        skipped_ids: [...skipped.map((s) => s.id), ...missing],
      };
    }

    const now = new Date().toISOString();
    const eligibleIds = eligible.map((r) => r.id);

    const { error: upErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancel_reason: why || null,
        cancelled_at: now,
      })
      .eq('user_id', user_id)
      .in('id', eligibleIds);
    if (upErr) throw new Error(`cancel_user_bookings update: ${upErr.message}`);

    for (const b of eligible) {
      await notifyUserInAppAndSms(supabase, {
        userId: user_id,
        title: 'Booking cancelled',
        body: why ? `Reason: ${why}` : 'Your booking was cancelled.',
        data: {
          booking_id: b.id,
          provider_id: b.provider_id,
          date: b.date,
          time: b.time,
          service_name: b.service_name ?? null,
        },
      });
    }

    return {
      success: true,
      cancelled_count: eligible.length,
      cancelled_ids: eligibleIds,
      reason_used: why,
      skipped_already_done: skipped.map((s) => ({ id: s.id, status: s.status })),
      not_found_ids: missing,
    };
  },

  update_user_booking: async ({ user_id, booking_id, date, time, payment_method }) => {
    const supabase = getServiceClient();
    const patch = {};
    if (date != null && String(date).trim()) patch.date = String(date).trim();
    if (time != null && String(time).trim()) patch.time = String(time).trim();
    if (payment_method != null && String(payment_method).trim()) {
      patch.payment_method = normalizeBookingPaymentMethod(payment_method);
    }
    if (!Object.keys(patch).length) {
      return { error: 'Provide at least one of date, time, payment_method' };
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .update(patch)
      .eq('id', booking_id)
      .eq('user_id', user_id)
      .select('id, provider_id, date, time, service_name, payment_method, status')
      .maybeSingle();

    if (error) throw new Error(`update_user_booking: ${error.message}`);
    if (!booking?.id) return { error: 'Booking not found or not owned by this user' };

    await notifyUserInAppAndSms(supabase, {
      userId: user_id,
      title: 'Booking updated',
      body: `Updated to ${booking.date} at ${booking.time}.`,
      data: {
        booking_id: booking.id,
        provider_id: booking.provider_id,
        date: booking.date,
        time: booking.time,
        service_name: booking.service_name ?? null,
        payment_method: booking.payment_method ?? null,
      },
    });

    return { success: true, booking };
  },

  delete_user_car: async ({ user_id, car_id, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error: 'Not confirmed. Ask the user to confirm removing this car, then call again with user_confirmed: true.',
      };
    }
    const supabase = getServiceClient();
    const { data: car, error: selErr } = await supabase
      .from('cars')
      .select('id, make, model')
      .eq('id', car_id)
      .eq('user_id', user_id)
      .maybeSingle();
    if (selErr) throw new Error(`delete_user_car: ${selErr.message}`);
    if (!car?.id) return { error: 'Car not found or not owned by this user' };

    const { error: delErr } = await supabase.from('cars').delete().eq('id', car_id).eq('user_id', user_id);
    if (delErr) throw new Error(`delete_user_car: ${delErr.message}`);

    return {
      success: true,
      deleted_car_id: car_id,
      message: `Removed ${[car.make, car.model].filter(Boolean).join(' ') || 'vehicle'} from your garage.`,
    };
  },

  get_wallet_balance: async ({ user_id }) => {
    const w = await walletService.getWallet(user_id);
    const bal = Number(w.balance);
    return {
      balance: bal,
      currency: w.currency,
      formatted: `${bal.toLocaleString()} ${w.currency}`,
      is_locked: w.is_locked,
      locked_reason: w.locked_reason,
      last_updated: w.updated_at,
    };
  },

  get_transaction_history: async ({ user_id, type, limit }) => {
    const supabase = getServiceClient();
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 25);
    let q = supabase
      .from('transactions')
      .select(
        'id, type, amount, fee, net_amount, balance_after, payment_method, description, initiated_by, status, created_at, completed_at, counterparty_user_id',
      )
      .or(`user_id.eq.${user_id},counterparty_user_id.eq.${user_id}`)
      .order('created_at', { ascending: false })
      .limit(lim);
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((tx) => ({
      ...tx,
      direction: tx.user_id === user_id ? 'out' : 'in',
      amount_formatted: `${Number(tx.amount).toLocaleString()} ${tx.currency || 'UGX'}`,
      date: tx.created_at,
    }));
  },

  lookup_provider_wallet_user: async ({ provider_id }) => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('providers')
      .select('id, name, user_id')
      .eq('id', provider_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data?.user_id) {
      return { error: 'Provider has no linked account (user_id). They must claim their provider profile first.' };
    }
    return {
      provider_id: data.id,
      provider_name: data.name,
      wallet_user_id: data.user_id,
    };
  },

  pay_provider_from_wallet: async ({ from_user_id, to_user_id, amount, booking_id, description, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. Summarize amount and recipient, ask the user to confirm, then call again with user_confirmed: true.',
      };
    }
    return walletService.transferToProvider({
      fromUserId: from_user_id,
      toUserId: to_user_id,
      amount: Number(amount),
      description: description || 'Wallet payment',
      bookingId: booking_id || null,
      initiatedBy: 'ai',
    });
  },

  list_wallet_payees: async ({ user_id }) => {
    const rows = await walletService.listPayees(user_id);
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      payee_user_id: r.payee_user_id,
      provider_id: r.provider_id,
      provider_name: r.providers?.name ?? null,
    }));
  },

  add_wallet_payee: async ({ user_id, label, provider_id, payee_user_id, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. Summarize label and who will be added (provider or user), ask the user to confirm, then call again with user_confirmed: true.',
      };
    }
    return walletService.addPayee({
      ownerUserId: user_id,
      label,
      providerId: provider_id ?? null,
      payeeUserId: payee_user_id ?? null,
    });
  },

  remove_wallet_payee: async ({ user_id, payee_id, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error: 'Not confirmed. Ask the user to confirm removing this payee, then call again with user_confirmed: true.',
      };
    }
    return walletService.removePayee(user_id, payee_id);
  },

  send_to_wallet_payee: async ({ user_id, payee_id, amount, description, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. State payee label, amount in UGX, and ask the user to confirm, then call again with user_confirmed: true.',
      };
    }
    return walletService.transferToSavedPayee({
      ownerUserId: user_id,
      payeeRowId: payee_id,
      amount: Number(amount),
      description: description || undefined,
      initiatedBy: 'ai',
    });
  },

  withdraw_to_mobile_money: async ({ user_id, amount, phone, provider, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. Repeat amount, phone number, and network (mtn, airtel, or auto); ask for explicit yes, then call with user_confirmed: true.',
      };
    }
    let p = provider != null && String(provider).trim() !== '' ? String(provider).toLowerCase() : 'auto';
    if (p !== 'mtn' && p !== 'airtel') {
      const inferred = walletService.inferUgandaMomoProviderFromPhone(phone);
      p = inferred || 'auto';
    }
    return walletService.initiateWithdrawal({
      userId: user_id,
      amount: Number(amount),
      phone: String(phone),
      provider: p,
    });
  },

  save_wallet_ai_memory: async ({ user_id, note, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error: 'Not confirmed. Read back the note and ask the user to confirm saving it, then call with user_confirmed: true.',
      };
    }
    await walletService.saveWalletAiMemory(user_id, note);
    return { success: true, message: 'Wallet note saved for future chats.' };
  },

  save_learned_memory: async ({ user_id, memory_text, user_confirmed }) => {
    if (!user_confirmed) {
      return {
        error:
          'Not confirmed. Read back the exact memory you will store; ask for explicit yes, then call save_learned_memory with user_confirmed: true.',
      };
    }
    const text = String(memory_text ?? '')
      .trim()
      .slice(0, 500);
    if (!text) {
      return { error: 'memory_text is empty.' };
    }
    const supabase = getServiceClient();
    const { data: inserted, error } = await supabase
      .from('user_ai_learned_memories')
      .insert({ user_id, body: text })
      .select('id')
      .single();
    if (error) {
      if (/user_ai_learned_memories/.test(error.message) || error.code === '42P01') {
        return { error: 'Learned memory storage is not available yet (database migration pending).' };
      }
      throw new Error(`save_learned_memory failed: ${error.message}`);
    }
    const MAX = 120;
    const { data: ordered } = await supabase
      .from('user_ai_learned_memories')
      .select('id')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true });
    if (ordered && ordered.length > MAX) {
      const victimIds = ordered.slice(0, ordered.length - MAX).map((r) => r.id);
      if (victimIds.length) {
        await supabase.from('user_ai_learned_memories').delete().in('id', victimIds);
      }
    }
    return {
      success: true,
      id: inserted?.id ?? null,
      message: 'Saved. This will appear in future assistant context for this user.',
    };
  },

  forget_learned_memory: async ({ user_id, memory_id }) => {
    const mid = String(memory_id ?? '').trim();
    if (!mid) {
      return { error: 'memory_id required (UUID from learnedMemories).' };
    }
    const supabase = getServiceClient();
    const { data: row, error: selErr } = await supabase
      .from('user_ai_learned_memories')
      .select('id')
      .eq('id', mid)
      .eq('user_id', user_id)
      .maybeSingle();
    if (selErr) {
      if (/user_ai_learned_memories/.test(selErr.message) || selErr.code === '42P01') {
        return { error: 'Learned memory storage is not available yet (database migration pending).' };
      }
      throw new Error(`forget_learned_memory: ${selErr.message}`);
    }
    if (!row) {
      return { error: 'No memory with that id for this user. Call get_user_profile or rely on context ids.' };
    }
    const { error: delErr } = await supabase.from('user_ai_learned_memories').delete().eq('id', mid).eq('user_id', user_id);
    if (delErr) throw new Error(`forget_learned_memory delete: ${delErr.message}`);
    return { success: true, message: 'Memory removed.' };
  },

  send_uganda_sms: async ({ user_id, phone_number, message, user_confirmed }) => {
    await requireSmsAccess(String(user_id));
    const confirmed =
      user_confirmed === true || String(user_confirmed ?? '').toLowerCase() === 'true';
    if (!confirmed) {
      return {
        error:
          'Confirm with the user first: repeat the exact Uganda number and message, then call again with user_confirmed: true.',
      };
    }
    const to = toUgandaE164(phone_number);
    if (!to) {
      return {
        error:
          'Not a valid Uganda mobile. Use 10 digits starting with 0 (e.g. 0771234567), or 256… / +256… with 9 digits after 256.',
      };
    }
    const body = String(message ?? '').trim();
    if (!body) {
      return { error: 'message is empty' };
    }
    if (body.length > 1600) {
      return { error: 'message too long (max 1600 characters)' };
    }

    const out = await sendSmsIfConfigured({ to, body });
    if (out.skipped) {
      return {
        error: 'SMS is not available (Twilio not configured or TWILIO_SMS_ENABLED disables sending).',
      };
    }
    if (out.error) {
      return { error: out.error };
    }
    console.log('[send_uganda_sms]', { actor_user_id: user_id, to });
    return { success: true, message_sid: out.sid, to };
  },
};
