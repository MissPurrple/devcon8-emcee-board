import { SESSIONS } from "./sessions-data.js";

export { SESSIONS };

// Venue time zone: Mumbai (IST) is UTC+05:30 all year (no daylight saving).
export const VENUE_UTC_OFFSET_MIN = 330;
// Day 1 of Devcon 8 is Tuesday 3 November 2026.
const DAY1 = { year: 2026, monthIndex: 10, date: 3 };

export const DAYS = {
  1: "Tue 3 Nov",
  2: "Wed 4 Nov",
  3: "Thu 5 Nov",
  4: "Fri 6 Nov",
};

export const STAGES = {
  Main: "Main Stage (Lotus)",
  L1: "Lotus Stage 1",
  L2: "Lotus Stage 2",
  L3: "Lotus Stage 3",
  J4: "Jasmine Stage 4",
  LT: "Lightning Stage",
  W1: "Workshop 1",
  W2: "Workshop 2",
};

export const CALL_TIME_MIN = 30;

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Real moment (ms since epoch) a venue-local "HH:MM" on a given day happens. */
export function instant(day, hhmm) {
  const utcMidnight = Date.UTC(DAY1.year, DAY1.monthIndex, DAY1.date + (day - 1));
  return utcMidnight + (toMin(hhmm) - VENUE_UTC_OFFSET_MIN) * 60_000;
}

export const startOf = (s) => instant(s.day, s.start);
export const endOf = (s) => instant(s.day, s.end);
export const durationMin = (s) => toMin(s.end) - toMin(s.start);

/** "14:30" -> "2:30pm" */
export function clock(hhmm) {
  let h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3);
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m === "00" ? `${h}${ap}` : `${h}:${m}${ap}`;
}

export function minusMinutes(hhmm, n) {
  const t = toMin(hhmm) - n;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** All named emcees (excludes TBC), alphabetical. */
export const EMCEES = [...new Set(SESSIONS.map((s) => s.emcee))]
  .filter((n) => n !== "TBC")
  .sort((a, b) => a.localeCompare(b));

export function shiftsFor(emcee) {
  return SESSIONS.filter((s) => s.emcee === emcee).sort((a, b) => startOf(a) - startOf(b));
}

export function totalMinutes(emcee) {
  return shiftsFor(emcee).reduce((sum, s) => sum + durationMin(s), 0);
}
