/**
 * When Gemini omits emit_chat_widgets, infer pickers from assistant text so the app still shows controls.
 */
export function inferFallbackWidgetsFromText(answer = '', userMessage = '') {
  const text = `${String(answer)}\n${String(userMessage)}`;
  const a = text.toLowerCase();
  const out = [];

  const needDate =
    /\b(what date|which date|pick (a )?date|choose (a )?date|preferred date|booking date|what day|which day|calendar)\b/i.test(
      text,
    ) ||
    /\bwhen (would|do|will) you like\b/i.test(answer) ||
    /\bwhat (day|date)\b/i.test(answer) ||
    /\bwhat date\?/i.test(answer) ||
    /yyyy-mm-dd/i.test(answer) ||
    /\btoday\s*\/\s*tomorrow/i.test(answer) ||
    (/\breply\b/i.test(answer) && /\b(today|tomorrow|yyyy)\b/i.test(answer)) ||
    /\bwhen should it happen/i.test(answer) ||
    /\bwhen do you need it/i.test(answer) ||
    /\bnew date\?/i.test(answer) ||
    (/\bdate\b/i.test(answer) &&
      /\b(book|schedule|appointment|reservation|service|visit|slot|yyyy|tomorrow|today)\b/i.test(answer));

  const needTime =
    /\b(what time|which time|pick (a )?time|preferred time|time slot|what time works|clock)\b/i.test(text) ||
    /\btime (works|suit|prefer)|\bat what time\b/i.test(answer) ||
    /\bwhat time\?/i.test(answer) ||
    /\bnew time\?/i.test(answer) ||
    (/\btime\b/i.test(answer) &&
      /\b(e\.g\.|10:30|2pm|asap|book|schedule|appointment)\b/i.test(answer) &&
      /\?/.test(answer)) ||
    (/\btime\b/i.test(answer) && /\b(book|schedule|appointment|asap|slot|morning|afternoon|evening)\b/i.test(answer));

  const needPhoto =
    /\b(photo|picture|image|camera|snap|take a pic|send (me )?(a )?photo|attach (a )?photo|show me)\b/i.test(answer);

  const needAudio =
    /\b(record|recording|audio|sound|listen|hear (a )?|noise|misfire|knock|rattle|engine sound|exhaust note)\b/i.test(
      answer,
    );

  if (needDate) out.push({ type: 'date_picker', label: 'Choose date', hint: 'Tap to open the calendar' });
  if (needTime) out.push({ type: 'time_picker', label: 'Choose time', hint: 'Tap to set the clock' });
  if (needPhoto) out.push({ type: 'photo_capture', label: 'Photo', hint: 'Camera or photo library' });
  if (needAudio) out.push({ type: 'audio_record', label: 'Record sound', hint: 'Hold the phone near the noise', max_seconds: 45 });

  const needPayment =
    /\b(how (would|do|will) you like to pay|payment method|pay with|wallet or card|stripe|cash or card)\b/i.test(
      text,
    ) ||
    (/\bpay\b/i.test(answer) && /\b(wallet|card|cash|stripe|mobile money|later)\b/i.test(answer) && /\?/.test(answer));
  if (needPayment) {
    out.push({
      type: 'payment_method_picker',
      label: 'How would you like to pay?',
      hint: 'Wallet, card, cash/pay later, or mobile money',
    });
  }

  return out.length ? out : undefined;
}
