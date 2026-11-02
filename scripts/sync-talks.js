// Refreshes the "talks" on every emcee slot from the official Devcon 8 schedule.
// Run with: npm run sync-talks          (writes lib/sessions-data.js)
//           npm run sync-talks -- --dry (only prints the report)
//
// Source: https://api.devcon.org/sessions?event=devcon8 (the same data as app.devcon.org/schedule).
// Each talk goes on the emcee slot on the same day + stage that it overlaps most.
// Only the "talks" arrays change: slot ids, times and emcees in lib/sessions-data.js are left alone.
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DATA = fileURLToPath(new URL("../lib/sessions-data.js", import.meta.url));
const API = "https://api.devcon.org/sessions?event=devcon8&size=1000";
const ROOMS = {
  "Main Stage (Lotus)": "Main",
  "Lotus Stage 1": "L1",
  "Lotus Stage 2": "L2",
  "Lotus Stage 3": "L3",
  "Jasmine Stage 4": "J4",
  "Lightning Stage": "LT",
  "Workshop 1": "W1",
  "Workshop 2": "W2",
};
const DAY1_UTC = Date.UTC(2026, 10, 3);
const IST_MS = 330 * 60000;

/** epoch ms -> [day number, "HH:MM" Mumbai time] */
function venue(ms) {
  const t = ms + IST_MS;
  const day = Math.floor((t - DAY1_UTC) / 86400000) + 1;
  return [day, new Date(t).toISOString().slice(11, 16)];
}
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

const { SESSIONS } = await import(new URL("../lib/sessions-data.js", import.meta.url));
const res = await fetch(API);
if (!res.ok) throw new Error(`Devcon API answered ${res.status}`);
const { items, total } = (await res.json()).data;
if (items.length !== total) throw new Error(`Only got ${items.length} of ${total} sessions; raise size= in the API URL.`);

const talks = new Map(SESSIONS.map((s) => [s.id, []]));
const unmatched = [];
const otherRooms = {};
for (const x of items) {
  const room = x.slot_room?.name || "(no room)";
  const stage = ROOMS[room];
  if (!stage) { otherRooms[room] = (otherRooms[room] || 0) + 1; continue; }
  const [day, start] = venue(x.slot_start);
  const [, end] = venue(x.slot_end);
  let best = null, most = 0;
  for (const s of SESSIONS) {
    if (s.day !== day || s.stage !== stage) continue;
    const overlap = Math.min(toMin(end), toMin(s.end)) - Math.max(toMin(start), toMin(s.start));
    if (overlap > most) { most = overlap; best = s; }
  }
  const talk = {
    title: x.title.replace(/\s+/g, " ").trim(),
    speaker: (x.speakers || []).map((p) => p.name.trim()).join(", "),
    start,
    end,
  };
  if (best) talks.get(best.id).push(talk);
  else unmatched.push(`Day ${day} ${room} ${start}-${end}: ${talk.title}`);
}
for (const list of talks.values()) list.sort((a, b) => a.start.localeCompare(b.start));

const count = [...talks.values()].reduce((n, l) => n + l.length, 0);
console.log(`Official sessions: ${items.length}. Placed on emcee slots: ${count}.`);
console.log("Rooms with no emcee on the MC sheet (skipped):", otherRooms);
console.log(unmatched.length ? `NOT on any emcee slot (${unmatched.length}) — check the MC sheet:\n  ${unmatched.join("\n  ")}` : "Every talk on an MC stage is inside an emcee slot.");
const empty = SESSIONS.filter((s) => !talks.get(s.id).length);
if (empty.length) console.log("Emcee slots with no talks:", empty.map((s) => `#${s.id} Day ${s.day} ${s.stage} ${s.start}`).join(", "));
const outside = SESSIONS.filter((s) => talks.get(s.id).some((t) => t.start < s.start || t.end > s.end));
if (outside.length) console.log("Slots whose talks start before / end after the MC sheet times:", outside.map((s) => `#${s.id} Day ${s.day} ${s.stage} ${s.start}-${s.end} (${s.emcee})`).join(", "));

if (process.argv.includes("--dry")) process.exit(0);

const ORDER = ["day", "stage", "start", "end", "tracks", "emcee", "flag", "kind", "talks", "id"];
const line = (s) => "  {" + ORDER.filter((k) => k in s).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(s[k])}`).join(", ") + "}";
const src = fs.readFileSync(DATA, "utf8");
const head = src.slice(0, src.indexOf("export const SESSIONS"));
const body = SESSIONS.map((s) => line({ ...s, talks: talks.get(s.id) })).join(",\n");
fs.writeFileSync(DATA, `${head}export const SESSIONS = [\n${body}\n];\n`);
console.log(`Wrote ${DATA}. Now run: npm test (update the expected talk count in the test if it changed).`);
