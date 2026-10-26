import { currentUser, clearLoginCookie } from "../lib/security.js";
import { getEmcee, unlink, isLocked, setLocked } from "../lib/store.js";
import { activate } from "../lib/reminders.js";
import { EMCEES } from "../lib/schedule.js";
import { send } from "../lib/telegram.js";

// GET  /api/account                 -> who is logged in, and which emcee they are
// POST /api/account {action:"link", emcee}  -> "this is me", turns reminders on
// POST /api/account {action:"unlink"}       -> turn reminders off
// POST /api/account {action:"lock"}         -> lock the name so it can't be changed by mistake
// POST /api/account {action:"unlock"}       -> allow changing / turning off again
// POST /api/account {action:"logout"}
export default async function handler(req, res) {
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  const user = currentUser(req);

  if (req.method === "GET") {
    const emcee = user ? await getEmcee(user.id) : null;
    return res.status(200).json({ botUsername, emcees: EMCEES, user, emcee, locked: emcee ? await isLocked(user.id) : false });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Use GET or POST" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (body.action === "logout") {
    clearLoginCookie(res);
    return res.status(200).json({ ok: true });
  }
  if (!user) return res.status(401).json({ error: "Please log in with Telegram first." });

  const emcee = await getEmcee(user.id);
  const locked = emcee ? await isLocked(user.id) : false;
  if (locked && (body.action === "link" || body.action === "unlink")) {
    return res.status(409).json({ error: `Your name is locked as ${emcee}. Unlock it first.` });
  }
  if (body.action === "lock") {
    if (!emcee) return res.status(400).json({ error: "Pick your name first." });
    await setLocked(user.id, true);
    return res.status(200).json({ ok: true, emcee, locked: true });
  }
  if (body.action === "unlock") {
    await setLocked(user.id, false);
    return res.status(200).json({ ok: true, emcee, locked: false });
  }
  if (body.action === "link") {
    if (!EMCEES.includes(body.emcee)) return res.status(400).json({ error: "That name isn't on the MC schedule." });
    const delivered = await activate(user.id, body.emcee);
    return res.status(200).json({ ok: true, emcee: body.emcee, delivered });
  }
  if (body.action === "unlink") {
    await unlink(user.id);
    await send(user.id, "Reminders are off. Send /start any time to turn them back on.");
    return res.status(200).json({ ok: true, emcee: null });
  }
  res.status(400).json({ error: "Unknown action" });
}
