import { isFromTelegram } from "../lib/security.js";
import { tg, send, esc } from "../lib/telegram.js";
import { saveProfile, getEmcee, unlink, isLocked, setLocked } from "../lib/store.js";
import { activate } from "../lib/reminders.js";
import { scheduleMessage, nextMessage, reminderMessage, commandsFooter, lockedMessage } from "../lib/messages.js";
import { EMCEES, shiftsFor, endOf } from "../lib/schedule.js";

// POST /api/telegram — Telegram delivers every message sent to the bot here (the "webhook").
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Telegram webhook is running.");
  if (!isFromTelegram(req)) return res.status(401).json({ error: "Not from Telegram" });
  const update = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  try {
    if (update.callback_query) await onButton(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (e) {
    console.error("bot error", e);
  }
  // Always answer 200 so Telegram doesn't keep retrying the same update.
  res.status(200).json({ ok: true });
}

function namePicker() {
  const rows = [];
  for (let i = 0; i < EMCEES.length; i += 2) {
    rows.push(EMCEES.slice(i, i + 2).map((n) => ({ text: n, callback_data: `p:${n}`.slice(0, 64) })));
  }
  return { inline_keyboard: rows };
}

async function askName(chatId, intro = true) {
  const text =
    (intro ? "<b>Hi! I'm the Devcon 8 emcee reminder bot.</b>\n\n" : "") +
    "Tap your name below. I'll send you your slots, then remind you 2 hours and 1 hour before each one.";
  await send(chatId, text, { reply_markup: namePicker() });
}

const LOCK_BUTTON = { inline_keyboard: [[{ text: "🔒 Lock my name", callback_data: "lock" }]] };
const UNLOCK_BUTTON = { inline_keyboard: [[{ text: "Yes, unlock", callback_data: "unlock" }]] };

async function lock(id, emcee) {
  await setLocked(id, true);
  return send(id, `🔒 Locked. You're <b>${esc(emcee)}</b>, and your name can't be changed by mistake. Reminders stay on.\n\nSend /unlock if you ever need to change it.`);
}

async function onMessage(msg) {
  if (msg.chat?.type !== "private") return; // only works in direct messages
  const id = msg.from.id;
  await saveProfile(msg.from);
  const cmd = (msg.text || "").trim().split(/\s|@/)[0].toLowerCase();
  const emcee = await getEmcee(id);
  const locked = emcee ? await isLocked(id) : false;

  if (cmd === "/start") {
    if (emcee) return send(id, `You're linked as <b>${esc(emcee)}</b>. Reminders are on.\n\n` + scheduleMessage(emcee, Date.now(), { intro: false, locked }));
    return askName(id);
  }
  if (locked && (cmd === "/change" || cmd === "/stop")) return send(id, lockedMessage(emcee));
  if (cmd === "/change") return askName(id, false);
  if (!emcee && ["/myshifts", "/next", "/test", "/lock", "/unlock"].includes(cmd)) return askName(id, false);
  if (cmd === "/lock") return locked ? send(id, lockedMessage(emcee)) : lock(id, emcee);
  if (cmd === "/unlock") {
    if (!locked) return send(id, "Your name isn't locked. Send /lock to lock it.");
    return send(id, `Unlock <b>${esc(emcee)}</b>? You'll be able to change your name or turn off reminders again.`, { reply_markup: UNLOCK_BUTTON });
  }
  if (cmd === "/myshifts") return send(id, scheduleMessage(emcee, Date.now(), { intro: false, locked }));
  if (cmd === "/next") return send(id, nextMessage(emcee));
  if (cmd === "/test") {
    const s = shiftsFor(emcee).find((x) => endOf(x) > Date.now()) || shiftsFor(emcee)[0];
    return send(id, "<i>This is a test. A real reminder looks like this:</i>\n\n" + reminderMessage(s, 120, Date.now()));
  }
  if (cmd === "/stop") {
    await unlink(id);
    return send(id, "Reminders are off. Send /start any time to turn them back on.");
  }
  return send(
    id,
    emcee
      ? `You're linked as <b>${esc(emcee)}</b>.\n\n/myshifts – your slots\n/next – your next slot\n/test – preview a reminder\n` + commandsFooter(locked)
      : "Send /start to choose your name and turn on reminders."
  );
}

async function onButton(q) {
  const id = q.from.id;
  await saveProfile(q.from);
  const emcee = await getEmcee(id);
  const locked = emcee ? await isLocked(id) : false;

  if (q.data === "lock") {
    if (!emcee) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Pick your name first. Send /start." });
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: locked ? "Already locked" : "Name locked" });
    return locked ? send(id, lockedMessage(emcee)) : lock(id, emcee);
  }
  if (q.data === "unlock") {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: locked ? "Name unlocked" : "Already unlocked" });
    if (!locked) return;
    await setLocked(id, false);
    return send(id, `🔓 Unlocked. You can now /change your name or /stop reminders. Send /lock to lock it again.`);
  }
  if (locked) {
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: `Your name is locked as ${emcee}. Send /unlock first.`, show_alert: true });
  }

  const name = (q.data || "").startsWith("p:") ? q.data.slice(2) : "";
  if (!EMCEES.includes(name)) {
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: "That name isn't on the schedule any more. Send /change." });
  }
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: `Linked as ${name}` });
  if (q.message) {
    await tg("editMessageText", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: `You picked <b>${esc(name)}</b>.`,
      parse_mode: "HTML",
    }).catch(() => {});
  }
  const delivered = await activate(id, name);
  if (delivered) await send(id, "Want to make sure your name can't be changed by mistake? You can lock it.", { reply_markup: LOCK_BUTTON });
}
