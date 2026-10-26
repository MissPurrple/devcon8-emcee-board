import crypto from "node:crypto";

// One secret (ADMIN_SECRET) protects the admin links and is used to derive the other keys,
// so you only have to invent one password during setup.
function adminSecret() {
  const s = (process.env.ADMIN_SECRET || "").trim();
  if (!s || s.length < 16) throw new Error("ADMIN_SECRET is missing or shorter than 16 characters (README step 5).");
  return s;
}

const derive = (label) => crypto.createHmac("sha256", adminSecret()).update(label).digest();

/** Secret Telegram sends back on every webhook call, so nobody else can pretend to be Telegram. */
export const webhookSecret = () => derive("telegram-webhook").toString("hex").slice(0, 48);

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Admin endpoints accept ?key=ADMIN_SECRET, or "Authorization: Bearer <ADMIN_SECRET or CRON_SECRET>". */
export function isAdmin(req) {
  const key = req.query?.key;
  if (key && safeEqual(key, adminSecret())) return true;
  const auth = req.headers?.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer) return false;
  if (safeEqual(bearer, adminSecret())) return true;
  const cron = (process.env.CRON_SECRET || "").trim();
  return Boolean(cron) && safeEqual(bearer, cron);
}

export function isFromTelegram(req) {
  return safeEqual(req.headers?.["x-telegram-bot-api-secret-token"] || "", webhookSecret());
}

/**
 * Checks data from the "Log in with Telegram" button really came from Telegram.
 * Algorithm from https://core.telegram.org/widgets/login-legacy :
 * sort fields (except hash) as key=value lines, HMAC-SHA256 with key = SHA256(bot token).
 */
export function verifyTelegramLogin(data, botToken, nowMs = Date.now(), maxAgeSec = 86400) {
  if (!data || typeof data !== "object" || !data.hash || !data.id || !data.auth_date) return false;
  const checkString = Object.keys(data)
    .filter((k) => k !== "hash" && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");
  const key = crypto.createHash("sha256").update(String(botToken).trim()).digest();
  const expected = crypto.createHmac("sha256", key).update(checkString).digest("hex");
  if (!safeEqual(expected, String(data.hash))) return false;
  const age = nowMs / 1000 - Number(data.auth_date);
  return age >= -300 && age <= maxAgeSec;
}

// ---- Login cookie --------------------------------------------------------
const COOKIE = "dc8_session";

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", derive("session")).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function unsign(value) {
  if (!value || !value.includes(".")) return null;
  const [body, sig] = value.split(".");
  const expected = crypto.createHmac("sha256", derive("session")).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setLoginCookie(res, user) {
  const days = 30;
  const value = sign({ id: user.id, first_name: user.first_name || "", username: user.username || "", exp: Date.now() + days * 864e5 });
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`);
}

export function clearLoginCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function currentUser(req) {
  return unsign(readCookie(req, COOKIE));
}
