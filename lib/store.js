import { Redis } from "@upstash/redis";

// Storage lives in Upstash Redis (added from the Vercel Marketplace).
// Vercel may name the variables KV_REST_API_* or UPSTASH_REDIS_REST_*; both are accepted.
let client = null;

export function redisConfigured() {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

export function db() {
  if (client) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Storage is not connected. Add Upstash Redis to this Vercel project (see README step 4).");
  }
  client = new Redis({ url, token });
  return client;
}

/** Used only by the automated tests to swap in an in-memory store. */
export function useStoreForTests(fake) {
  client = fake;
}

// ---- Data layout -------------------------------------------------------
// tg:<telegramId>        -> { id, first_name, username }   (profile from login or bot)
// emcee:<telegramId>     -> "Miss Purple"                   (who this person is on the schedule)
// locked:<telegramId>    -> "1" while they've locked their name (no changing it until they unlock)
// subscribers            -> set of telegramIds that get reminders
// sent:<id>:<session>:<mark> -> "1" (stops a reminder being sent twice; expires after 7 days)

export async function saveProfile(user) {
  await db().set(`tg:${user.id}`, {
    id: user.id,
    first_name: user.first_name || "",
    username: user.username || "",
  });
}

export async function getEmcee(id) {
  return (await db().get(`emcee:${id}`)) || null;
}

export async function linkEmcee(id, emcee) {
  await db().set(`emcee:${id}`, emcee);
  await db().sadd("subscribers", String(id));
}

export async function unlink(id) {
  await db().del(`emcee:${id}`);
  await db().del(`locked:${id}`);
  await db().srem("subscribers", String(id));
}

export async function isLocked(id) {
  return Boolean(await db().get(`locked:${id}`));
}

export async function setLocked(id, locked) {
  if (locked) await db().set(`locked:${id}`, "1");
  else await db().del(`locked:${id}`);
}

export async function subscribers() {
  return ((await db().smembers("subscribers")) || []).map(String);
}

/** Returns true the first time it is called for this key, false after that. */
export async function markOnce(id, sessionId, mark) {
  const res = await db().set(`sent:${id}:${sessionId}:${mark}`, "1", { nx: true, ex: 7 * 24 * 3600 });
  return res === "OK";
}
