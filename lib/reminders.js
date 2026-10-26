import { shiftsFor, startOf, EMCEES } from "./schedule.js";
import { subscribers, getEmcee, markOnce, linkEmcee } from "./store.js";
import { reminderMessage, scheduleMessage } from "./messages.js";
import { send } from "./telegram.js";

// A reminder is due when the minutes left before the slot fall inside its window.
// The timer runs every 5 minutes, so windows are wide enough that a late run still catches them,
// and markOnce() makes sure each reminder goes out only once.
export const WINDOWS = [
  { mark: 120, after: 60, upTo: 120 }, // "about 2 hours" — sent when 60 < minutes left ≤ 120
  { mark: 60, after: 0, upTo: 60 }, //    "about 1 hour"  — sent when 0 < minutes left ≤ 60
];

export function dueMarks(session, now) {
  const left = (startOf(session) - now) / 60000;
  return WINDOWS.filter((w) => left > w.after && left <= w.upTo).map((w) => w.mark);
}

/**
 * Called when someone links their name. Sends their full list, and marks reminders whose
 * window has already started as sent, so a late sign-up doesn't get a burst of reminders.
 */
export async function activate(telegramId, emcee, now = Date.now()) {
  if (!EMCEES.includes(emcee)) throw new Error("Unknown emcee name");
  await linkEmcee(telegramId, emcee);
  for (const s of shiftsFor(emcee)) {
    const left = (startOf(s) - now) / 60000;
    if (left > 0 && left <= 120) {
      await markOnce(telegramId, s.id, 120);
      if (left <= 60) await markOnce(telegramId, s.id, 60);
    }
  }
  return send(telegramId, scheduleMessage(emcee, now));
}

/** Runs on every timer tick. Returns a summary for the logs / the person checking. */
export async function runReminders(now = Date.now()) {
  const summary = { checkedPeople: 0, sent: 0, undeliverable: 0, at: new Date(now).toISOString() };
  for (const id of (await subscribers()).map(Number)) {
    const emcee = await getEmcee(id);
    if (!emcee) continue;
    summary.checkedPeople++;
    for (const s of shiftsFor(emcee)) {
      for (const mark of dueMarks(s, now)) {
        if (!(await markOnce(id, s.id, mark))) continue; // already sent
        const ok = await send(id, reminderMessage(s, mark, now));
        ok ? summary.sent++ : summary.undeliverable++;
      }
    }
  }
  return summary;
}
