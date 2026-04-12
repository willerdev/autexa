/** Simple in-memory rate limit: max `limit` hits per `windowMs` per key. */

const buckets = new Map();

export function rateLimitHit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let arr = buckets.get(key);
  if (!arr) {
    arr = [];
    buckets.set(key, arr);
  }
  const cutoff = now - windowMs;
  const next = arr.filter((t) => t > cutoff);
  next.push(now);
  buckets.set(key, next);
  return next.length > limit;
}
