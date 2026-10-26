import { verifyTelegramLogin, setLoginCookie } from "../lib/security.js";
import { saveProfile, getEmcee } from "../lib/store.js";

// POST /api/auth — the "Log in with Telegram" button sends the person's Telegram data here.
// We check Telegram's signature, then keep them logged in with a cookie.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const data = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (!verifyTelegramLogin(data, process.env.TELEGRAM_BOT_TOKEN || "")) {
    return res.status(401).json({ error: "Telegram login could not be verified. Please try again." });
  }
  const user = { id: Number(data.id), first_name: data.first_name, username: data.username };
  await saveProfile(user);
  setLoginCookie(res, user);
  res.status(200).json({ user, emcee: await getEmcee(user.id) });
}
