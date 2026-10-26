import { DAYS, STAGES, CALL_TIME_MIN, clock, minusMinutes, fmtDuration, durationMin, shiftsFor, startOf, endOf, totalMinutes } from "./schedule.js";
import { esc } from "./telegram.js";

const site = () => (process.env.SITE_URL || "").trim().replace(/\/$/, "");

function shiftLines(s) {
  const lines = [
    `• <b>${clock(s.start)}–${clock(s.end)}</b> · ${esc(STAGES[s.stage])}`,
    `   Topic: ${esc(s.tracks)}`,
    `   Be at the stage by ${clock(minusMinutes(s.start, CALL_TIME_MIN))}`,
  ];
  if (s.kind === "clash") lines.push(`   ⚠️ ${esc(s.flag)}`);
  for (const t of s.talks || []) {
    lines.push(`   – ${t.start ? clock(t.start) + " " : ""}${esc(t.title)}${t.speaker ? " (" + esc(t.speaker) + ")" : ""}`);
  }
  return lines.join("\n");
}

/** Full list of someone's upcoming slots, grouped by day. */
export function scheduleMessage(emcee, now = Date.now(), { intro = true } = {}) {
  const all = shiftsFor(emcee);
  const upcoming = all.filter((s) => endOf(s) > now);
  const done = all.length - upcoming.length;
  const out = [];
  if (intro) out.push(`<b>You're set, ${esc(emcee)}.</b>`);
  if (!upcoming.length) {
    out.push(all.length ? "All your Devcon 8 slots have finished. Thank you!" : "There are no slots under this name on the MC schedule.");
    return out.join("\n");
  }
  out.push(
    `You have <b>${upcoming.length}</b> upcoming slot${upcoming.length > 1 ? "s" : ""} at Devcon 8` +
      (done ? ` (${done} already finished)` : "") +
      `. Total on stage: ${fmtDuration(totalMinutes(emcee))}.`
  );
  let day = null;
  for (const s of upcoming) {
    if (s.day !== day) {
      day = s.day;
      out.push(`\n<b>Day ${day} · ${DAYS[day]}</b>`);
    }
    out.push(shiftLines(s));
  }
  if (intro) out.push(`\nI'll message you <b>2 hours</b> and <b>1 hour</b> before each slot. Times are Mumbai time (IST).`);
  out.push(`\n/myshifts – see this list again\n/next – your next slot\n/change – pick a different name\n/stop – turn off reminders`);
  if (site()) out.push(`Full schedule: ${esc(site())}`);
  return out.join("\n");
}

export function nextMessage(emcee, now = Date.now()) {
  const s = shiftsFor(emcee).find((x) => endOf(x) > now);
  if (!s) return "You have no upcoming slots.";
  const mins = Math.round((startOf(s) - now) / 60000);
  const when = mins > 0 ? `starts in ${fmtDuration(mins)}` : "is happening now";
  return `<b>Your next slot ${when}</b>\nDay ${s.day} · ${DAYS[s.day]}\n${shiftLines(s)}`;
}

export function reminderMessage(s, mark, now = Date.now()) {
  const mins = Math.max(1, Math.round((startOf(s) - now) / 60000));
  const head = mark === 120 ? "⏰ Heads up: your slot is in about 2 hours" : "⏰ Your slot is in about 1 hour";
  const lines = [
    `<b>${head}</b>`,
    `Starts in ${fmtDuration(mins)}, at ${clock(s.start)} (Mumbai time).`,
    "",
    `<b>Stage:</b> ${esc(STAGES[s.stage])}`,
    `<b>Day:</b> Day ${s.day} · ${DAYS[s.day]}`,
    `<b>Time:</b> ${clock(s.start)}–${clock(s.end)} (${fmtDuration(durationMin(s))})`,
    `<b>Topic:</b> ${esc(s.tracks)}`,
    `<b>Be at the stage by:</b> ${clock(minusMinutes(s.start, CALL_TIME_MIN))}`,
  ];
  if (s.talks?.length) {
    lines.push("", "<b>Talks:</b>");
    for (const t of s.talks) lines.push(`– ${t.start ? clock(t.start) + " " : ""}${esc(t.title)}${t.speaker ? " (" + esc(t.speaker) + ")" : ""}`);
  }
  if (s.kind === "clash") lines.push("", `⚠️ ${esc(s.flag)}`);
  lines.push("", "Exact session timings are in the Devcon Passport. Sessions can run over.");
  return lines.join("\n");
}
