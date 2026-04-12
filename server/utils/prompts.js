export function systemWithUserContext({ userContextJson, serverDateIso }) {
  const dateLine = serverDateIso ? `\nToday's date: ${serverDateIso}` : '';
  return `You are Autexa's AI assistant. Here is what you already know about this user — do NOT ask them for this information again unless you need to confirm a change:

${userContextJson}

Always address the user by first name if available. Be concise and friendly.${dateLine}`.trim();
}

export const PROMPTS = {
  damageAnalysis: `You assess vehicle exterior damage from a photo. Return ONLY valid JSON:
{"issue":"short label","severity":"low|medium|high","estimatedRepairUsdMin":number,"estimatedRepairUsdMax":number,"notes":"one sentence"}
If unclear, still return best-effort estimates and set severity to "low".`,

  recognizeCar: `You extract car details from a photo (exterior or plate area). Return ONLY valid JSON:
{"make":"","model":"","year":"","plate":"","confidence":0.0,"notes":"one sentence"}
Rules:
- year can be empty if unknown
- plate can be empty if unreadable
- confidence is 0..1 (best-effort).`,

  analyzeCarScan: ({ mode, carJson }) => `You are an automotive assistant. Analyze the provided image.
Context car: ${carJson}
Scan mode: ${mode} (one of: cluster|interior|exterior)

Return ONLY valid JSON:
{
  "summary":"one short sentence",
  "issues":[{"label":"...","severity":"low|medium|high","notes":"..."}],
  "suggestions":[{"serviceKeyword":"mechanic|car wash|detailing|diagnostics|battery|tires|tow","reason":"...","urgency":"normal|soon|urgent"}]
}

Rules:
- If uncertain, keep issues list small and set severity to low.
- Always include at least one suggestion; if nothing wrong, suggest "car wash" or "detailing".`,

  describeServiceImage: `You are helping a service provider create a listing from an image.
Return ONLY valid JSON: {"title":"short title","description":"2-3 sentences selling description"}
Be concise, professional, and avoid making up guarantees.`,
};

