/**
 * Pitstop `/assist` is for quick provider/service listing (legacy marketplace flow).
 * Booking cancellations, reschedules, and vague follow-ups ("yes", "all of them") must use
 * `/api/ai/chat` so Gemini has mutating tools and server-stored conversation history.
 */
export function shouldRouteBookingTools(text: string) {
  const t = text.toLowerCase().trim();
  const raw = text.trim();

  if (
    (t.includes('cancel') && (t.includes('book') || t.includes('appointment') || t.includes('reservation'))) ||
    t.includes('cancel my booking') ||
    t.includes('cancel a booking') ||
    t.includes('delete my booking') ||
    t.includes('delete booking') ||
    t.includes('delete all') ||
    t.includes('remove all') ||
    t.includes('remove my booking') ||
    /\b(delete|remove|clear)\b.*\bbookings?\b/.test(t) ||
    /\bbookings?\b.*\b(delete|remove|clear)\b/.test(t)
  ) {
    return false;
  }

  if (
    t.includes('reschedule') ||
    t.includes('change date') ||
    t.includes('change time') ||
    t.includes('update booking') ||
    t.includes('edit booking')
  ) {
    return false;
  }

  if (
    /^(yes|yeah|yep|sure|ok|okay|confirm|confirmed|do it|go ahead|please|all|all of them|all of it|those|them|everyone|every one|both|none|no|nope|never mind|nevermind|skip|\d+)$/i.test(
      raw,
    )
  ) {
    return false;
  }
  if (/^(the )?(first|second|third|1st|2nd|3rd)\b/i.test(raw) && raw.length < 48) {
    return false;
  }

  const wordHints = [
    'mechanic',
    'car wash',
    'wash',
    'tow',
    'detail',
    'tire',
    'battery',
    'inspection',
    'oil',
    'brake',
    'service',
  ];
  if (wordHints.some((w) => t.includes(w))) return true;
  // Standalone "book" (e.g. "book a wash") — do not match "bookings" / "guidebook".
  if (/\bbook\b/.test(t)) return true;
  return false;
}

/**
 * Follow-ups that need server-stored Gemini history (cancel subsets, “except X”, confirmations).
 * Without this, a phrase like “delete them all except car wash” wrongly hits pitstop on “car wash”.
 */
export function shouldForceToolChatForText(text: string) {
  const t = text.toLowerCase().trim();
  if (
    /\b(except|excluding|but not|not the|only keep|keep only|leave the|leave only|skip the|without the)\b/.test(t)
  ) {
    return true;
  }
  if (/\b(all of them|those ones|these ones|them all)\b/.test(t) && /\b(delete|cancel|remove|drop)\b/.test(t)) {
    return true;
  }
  return false;
}
