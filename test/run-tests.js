// Automated checks. Run with: npm test
// Telegram and the database are replaced with in-memory fakes, so no accounts are needed.
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.ADMIN_SECRET = "test-admin-secret-123456";
process.env.CRON_SECRET = "vercel-cron-secret";
process.env.TELEGRAM_BOT_TOKEN = "123456:TEST-TOKEN";
process.env.TELEGRAM_BOT_USERNAME = "devcon8_mc_bot";
process.env.SITE_URL = "https://example.vercel.app";

const { useStoreForTests, getEmcee } = await import("../lib/store.js");
const { useTelegramForTests } = await import("../lib/telegram.js");
const sched = await import("../lib/schedule.js");
const { runReminders, activate } = await import("../lib/reminders.js");
const { verifyTelegramLogin, webhookSecret } = await import("../lib/security.js");
const telegramHook = (await import("../api/telegram.js")).default;
const cron = (await import("../api/cron.js")).default;
const auth = (await import("../api/auth.js")).default;
const account = (await import("../api/account.js")).default;
const schedule = (await import("../api/schedule.js")).default;

// ---- fakes ---------------------------------------------------------------
function fakeRedis() {
  const kv = new Map(), sets = new Map();
  return {
    kv, sets,
    async get(k) { return kv.has(k) ? kv.get(k) : null; },
    async set(k, v, o = {}) { if (o.nx && kv.has(k)) return null; kv.set(k, v); return "OK"; },
    async del(k) { kv.delete(k); return 1; },
    async sadd(k, v) { (sets.get(k) || sets.set(k, new Set()).get(k)).add(v); return 1; },
    async srem(k, v) { sets.get(k)?.delete(v); return 1; },
    async smembers(k) { return [...(sets.get(k) || [])]; },
  };
}
let calls = [];
const blocked = new Set();
useTelegramForTests(async (method, params) => {
  if (method === "sendMessage" && blocked.has(params.chat_id)) { const e = new Error("Forbidden"); e.code = 403; throw e; }
  calls.push({ method, params });
  return { ok: true };
});
const sent = (chatId) => calls.filter((c) => c.method === "sendMessage" && (chatId == null || c.params.chat_id === chatId));

function mockRes() {
  const r = { statusCode: 200, headers: {}, body: undefined };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  return r;
}
const req = (o) => ({ method: "GET", headers: {}, query: {}, body: undefined, ...o });

let passed = 0;
async function test(name, fn) {
  calls = [];
  useStoreForTests(fakeRedis());
  try { await fn(); passed++; console.log("  ok  ", name); }
  catch (e) { console.log("  FAIL", name); console.error(e); process.exitCode = 1; }
}
const IST = (day, hhmm) => sched.instant(day, hhmm);
const MIN = 60000;

// ---- schedule ------------------------------------------------------------
await test("venue time converts to the right real moment (10am IST on 3 Nov = 04:30 UTC)", () => {
  assert.equal(new Date(IST(1, "10:00")).toISOString(), "2026-11-03T04:30:00.000Z");
  assert.equal(new Date(IST(4, "13:30")).toISOString(), "2026-11-06T08:00:00.000Z");
});
await test("schedule has 64 slots, 29 named emcees, matching totals", () => {
  assert.equal(sched.SESSIONS.length, 64);
  assert.equal(sched.EMCEES.length, 29);
  assert.equal(sched.totalMinutes("Miss Purple"), 390);
  assert.equal(sched.totalMinutes("Alessandro Malventano"), 480);
  assert.equal(sched.totalMinutes("Jimin Lee"), 440);
  assert.ok(!sched.EMCEES.includes("TBC"));
  assert.equal(new Set(sched.SESSIONS.map((s) => s.id)).size, 64, "ids are unique");
});
await test("GET /api/schedule returns all slots", async () => {
  const res = mockRes(); schedule(req({}), res);
  assert.equal(res.body.sessions.length, 64);
});

// ---- login verification --------------------------------------------------
function signedLogin(fields, token = process.env.TELEGRAM_BOT_TOKEN) {
  const s = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = crypto.createHash("sha256").update(token).digest();
  return { ...fields, hash: crypto.createHmac("sha256", key).update(s).digest("hex") };
}
await test("Telegram login: genuine data accepted, tampered / wrong-bot / stale data rejected", () => {
  const now = Date.now();
  const good = signedLogin({ id: 42, first_name: "Purple", username: "misspurple", auth_date: Math.floor(now / 1000) });
  assert.equal(verifyTelegramLogin(good, process.env.TELEGRAM_BOT_TOKEN, now), true);
  assert.equal(verifyTelegramLogin({ ...good, id: 43 }, process.env.TELEGRAM_BOT_TOKEN, now), false);
  assert.equal(verifyTelegramLogin(signedLogin({ id: 42, auth_date: Math.floor(now / 1000) }, "999:OTHER"), process.env.TELEGRAM_BOT_TOKEN, now), false);
  const old = signedLogin({ id: 42, auth_date: Math.floor(now / 1000) - 2 * 86400 });
  assert.equal(verifyTelegramLogin(old, process.env.TELEGRAM_BOT_TOKEN, now), false);
});

// ---- bot -----------------------------------------------------------------
const hookReq = (update, secret = webhookSecret()) =>
  req({ method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: update });
const msg = (id, text) => ({ message: { chat: { id, type: "private" }, from: { id, first_name: "T" }, text } });

await test("bot ignores calls that don't carry the secret (someone pretending to be Telegram)", async () => {
  const res = mockRes(); await telegramHook(hookReq(msg(1, "/start"), "wrong"), res);
  assert.equal(res.statusCode, 401); assert.equal(calls.length, 0);
});
await test("/start shows a button for every emcee", async () => {
  await telegramHook(hookReq(msg(7, "/start")), mockRes());
  const m = sent(7)[0];
  const buttons = m.params.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.length, 29);
  assert.ok(buttons.every((b) => Buffer.byteLength(b.callback_data) <= 64));
});
await test("tapping a name links it and sends the full list of slots", async () => {
  await telegramHook(hookReq({ callback_query: { id: "q1", from: { id: 7 }, data: "p:Miss Purple", message: { chat: { id: 7 }, message_id: 5 } } }), mockRes());
  assert.ok(calls.some((c) => c.method === "answerCallbackQuery"));
  const text = sent(7).at(-2).params.text;
  assert.match(sent(7).at(-1).params.text, /You can lock it/, "lock offer follows the list");
  assert.match(text, /You're set, Miss Purple/);
  assert.match(text, /Lotus Stage 1/); assert.match(text, /Jasmine Stage 4/);
  assert.match(text, /Privacy &amp; Consent/, "& is escaped for Telegram");
  assert.match(text, /Be at the stage by 1:30pm/);
  assert.match(text, /2 hours<\/b> and <b>1 hour/);
});
await test("a forged button with a name not on the schedule is refused", async () => {
  await telegramHook(hookReq({ callback_query: { id: "q2", from: { id: 8 }, data: "p:Mallory" } }), mockRes());
  assert.equal(sent(8).length, 0);
});
await test("/myshifts, /next, /test and /stop work after linking", async () => {
  await activate(9, "Dmitrii Gusakov", IST(1, "08:00"));
  calls = [];
  for (const c of ["/myshifts", "/next", "/test", "/stop"]) await telegramHook(hookReq(msg(9, c)), mockRes());
  const texts = sent(9).map((m) => m.params.text);
  assert.match(texts[0], /Lotus Stage 3/);
  assert.match(texts[1], /Your next slot/);
  assert.match(texts[2], /This is a test/);
  assert.match(texts[3], /Reminders are off/);
});
await test("group chats are ignored", async () => {
  await telegramHook(hookReq({ message: { chat: { id: -100, type: "group" }, from: { id: 1 }, text: "/start" } }), mockRes());
  assert.equal(calls.length, 0);
});

// ---- reminders -----------------------------------------------------------
async function simulateEvent(people, from = IST(1, "06:00"), to = IST(4, "20:00"), stepMin = 5) {
  for (let t = from; t <= to; t += stepMin * MIN) await runReminders(t);
}
await test("every slot gets exactly one 2-hour and one 1-hour reminder (timer every 5 min, whole event)", async () => {
  const people = { 101: "Miss Purple", 102: "Alessandro Malventano", 103: "Dmitrii Gusakov", 104: "Esha Datanwala" };
  for (const [id, n] of Object.entries(people)) await activate(Number(id), n, IST(1, "05:00"));
  calls = [];
  // capture when each reminder was sent
  const log = [];
  for (let t = IST(1, "06:00"); t <= IST(4, "20:00"); t += 5 * MIN) {
    const before = calls.length;
    await runReminders(t);
    for (const c of calls.slice(before)) log.push({ t, c });
  }
  for (const [id, n] of Object.entries(people)) {
    const mine = log.filter((x) => x.c.params.chat_id === Number(id));
    const shifts = sched.shiftsFor(n);
    assert.equal(mine.length, shifts.length * 2, `${n}: 2 reminders per slot`);
    for (const s of shifts) {
      const r = mine.filter((x) => x.c.params.text.includes(`at ${sched.clock(s.start)} (Mumbai`) && x.c.params.text.includes(`Day ${s.day} ·`) && x.c.params.text.includes(`Stage:</b> ${sched.STAGES[s.stage]}`));
      const left = r.map((x) => (sched.startOf(s) - x.t) / MIN).sort((a, b) => b - a);
      assert.equal(r.length, 2, `${n} day ${s.day} ${s.start}`);
      assert.ok(left[0] <= 120 && left[0] > 114, `2h reminder sent ${left[0]} min before`);
      assert.ok(left[1] <= 60 && left[1] > 54, `1h reminder sent ${left[1]} min before`);
    }
  }
});
await test("reminder text has stage, day, times, topic and call time", async () => {
  await activate(201, "Martin Hansen", IST(3, "08:00"));
  calls = [];
  await runReminders(IST(3, "13:00")); // 2h before his 3pm Lotus 1 slot
  const t = sent(201)[0].params.text;
  assert.match(t, /about 2 hours/);
  assert.match(t, /Stage:<\/b> Lotus Stage 1/);
  assert.match(t, /Day 3 · Thu 5 Nov/);
  assert.match(t, /3pm–5:30pm \(2h 30m\)/);
  assert.match(t, /Topic:<\/b> Applied Cryptography, Users Builders Agents/);
  assert.match(t, /Be at the stage by:<\/b> 2:30pm/);
});
await test("double-booked slot reminder carries the clash warning", async () => {
  await activate(202, "Alessandro Malventano", IST(4, "07:00"));
  calls = [];
  await runReminders(IST(4, "08:30"));
  const texts = sent(202).map((m) => m.params.text);
  assert.equal(texts.length, 2, "one for each clashing slot");
  assert.ok(texts.every((t) => /⚠️ Clash/.test(t)));
});
await test("running the timer twice at the same moment sends nothing twice", async () => {
  await activate(203, "YQ", IST(1, "06:00"));
  calls = [];
  await runReminders(IST(1, "10:20")); await runReminders(IST(1, "10:20")); await runReminders(IST(1, "10:21"));
  assert.equal(sent(203).length, 1);
});
await test("late sign-up 90 min before a slot: list now, no 2h reminder, then the 1h reminder", async () => {
  calls = [];
  await activate(204, "BINJI", IST(1, "08:30")); // opening ceremony 10:00
  assert.equal(sent(204).length, 1, "activation list sent");
  calls = [];
  await simulateEvent(null, IST(1, "08:30"), IST(1, "10:30"));
  const texts = sent(204).map((m) => m.params.text);
  assert.equal(texts.length, 1);
  assert.match(texts[0], /about 1 hour/);
});
await test("sign-up 30 min before a slot: no reminders for that slot", async () => {
  await activate(205, "BINJI", IST(1, "09:30"));
  calls = [];
  await simulateEvent(null, IST(1, "09:30"), IST(1, "10:30"));
  assert.equal(sent(205).length, 0);
});
await test("after /stop, no more reminders", async () => {
  await activate(206, "Kirk Baird", IST(1, "06:00"));
  await telegramHook(hookReq(msg(206, "/stop")), mockRes());
  calls = [];
  await simulateEvent(null, IST(2, "06:00"), IST(2, "20:00"));
  assert.equal(sent(206).length, 0);
});
await test("someone who blocked the bot doesn't stop reminders for everyone else", async () => {
  await activate(207, "Kirk Baird", IST(1, "06:00"));
  await activate(208, "Kirk Baird", IST(1, "06:00"));
  blocked.add(207);
  calls = [];
  const s = await runReminders(IST(2, "11:00"));
  blocked.delete(207);
  assert.equal(s.undeliverable, 1); assert.equal(sent(208).length, 1);
});
await test("/change to another name: reminders follow the new name", async () => {
  await activate(209, "Ross", IST(1, "06:00"));
  await activate(209, "Ofir Eliasi", IST(1, "06:00"));
  calls = [];
  await simulateEvent(null, IST(2, "06:00"), IST(2, "20:00"));
  const texts = sent(209).map((m) => m.params.text);
  assert.equal(texts.length, 2); assert.ok(texts.every((t) => /Lotus Stage 3/.test(t)));
});

// ---- name lock -----------------------------------------------------------
const tap = (id, data) => ({ callback_query: { id: `q-${id}-${data}`, from: { id }, data } });
const answers = () => calls.filter((c) => c.method === "answerCallbackQuery").map((c) => c.params);
await test("lock: after locking, /change, /stop and other names are refused until unlock is confirmed", async () => {
  await telegramHook(hookReq(tap(400, "p:Miss Purple")), mockRes());
  assert.equal(sent(400).at(-1).params.reply_markup.inline_keyboard[0][0].callback_data, "lock", "lock is offered after picking");
  await telegramHook(hookReq(tap(400, "lock")), mockRes());
  assert.match(sent(400).at(-1).params.text, /Locked/);

  calls = [];
  for (const c of ["/change", "/stop"]) await telegramHook(hookReq(msg(400, c)), mockRes());
  assert.ok(sent(400).every((m) => /locked as <b>Miss Purple/.test(m.params.text) && !m.params.reply_markup));
  await telegramHook(hookReq(tap(400, "p:Ross")), mockRes());
  assert.ok(answers().at(-1).show_alert);
  assert.equal(await getEmcee(400), "Miss Purple", "name unchanged, reminders still on");
  await telegramHook(hookReq(msg(400, "/myshifts")), mockRes());
  assert.match(sent(400).at(-1).params.text, /Your name is locked/);

  await telegramHook(hookReq(msg(400, "/unlock")), mockRes());
  assert.equal(sent(400).at(-1).params.reply_markup.inline_keyboard[0][0].callback_data, "unlock", "unlock asks for confirmation");
  await telegramHook(hookReq(msg(400, "/change")), mockRes());
  assert.match(sent(400).at(-1).params.text, /locked as/, "still locked until confirmed");

  await telegramHook(hookReq(tap(400, "unlock")), mockRes());
  assert.match(sent(400).at(-1).params.text, /Unlocked/);
  await telegramHook(hookReq(msg(400, "/change")), mockRes());
  assert.equal(sent(400).at(-1).params.reply_markup.inline_keyboard.flat().length, 29, "name picker shown again");
  await telegramHook(hookReq(tap(400, "p:Ross")), mockRes());
  assert.equal(await getEmcee(400), "Ross");
});
await test("lock: a locked name still gets its reminders", async () => {
  await activate(401, "Martin Hansen", IST(3, "08:00"));
  await telegramHook(hookReq(msg(401, "/lock")), mockRes());
  calls = [];
  await runReminders(IST(3, "13:00"));
  assert.match(sent(401)[0].params.text, /about 2 hours/);
});
await test("website: lock blocks changing name and turning off until unlocked", async () => {
  const login = signedLogin({ id: 402, first_name: "Purple", auth_date: Math.floor(Date.now() / 1000) });
  let r = mockRes(); await auth(req({ method: "POST", body: login }), r);
  const cookie = r.headers["set-cookie"].split(";")[0];
  const post = async (body) => { const x = mockRes(); await account(req({ method: "POST", headers: { cookie }, body }), x); return x; };

  r = await post({ action: "lock" }); assert.equal(r.statusCode, 400, "can't lock before picking a name");
  await post({ action: "link", emcee: "Miss Purple" });
  r = await post({ action: "lock" }); assert.equal(r.body.locked, true);
  r = mockRes(); await account(req({ headers: { cookie } }), r); assert.equal(r.body.locked, true);

  r = await post({ action: "link", emcee: "Ross" }); assert.equal(r.statusCode, 409);
  r = await post({ action: "unlink" }); assert.equal(r.statusCode, 409);
  assert.equal(await getEmcee(402), "Miss Purple");

  r = await post({ action: "unlock" }); assert.equal(r.body.locked, false);
  r = await post({ action: "link", emcee: "Ross" }); assert.equal(r.statusCode, 200);
  assert.equal(await getEmcee(402), "Ross");
});

// ---- timer endpoint security ----------------------------------------------
await test("timer link refuses requests without the key, accepts ?key= and Vercel's Bearer secret", async () => {
  let r = mockRes(); await cron(req({}), r); assert.equal(r.statusCode, 401);
  r = mockRes(); await cron(req({ query: { key: "nope" } }), r); assert.equal(r.statusCode, 401);
  r = mockRes(); await cron(req({ query: { key: process.env.ADMIN_SECRET } }), r); assert.equal(r.statusCode, 200);
  r = mockRes(); await cron(req({ headers: { authorization: "Bearer vercel-cron-secret" } }), r); assert.equal(r.statusCode, 200);
});

// ---- website login + linking ---------------------------------------------
await test("website: log in, pick name, get list in Telegram, see it on the site, turn off", async () => {
  const login = signedLogin({ id: 300, first_name: "Purple", username: "misspurple", auth_date: Math.floor(Date.now() / 1000) });
  let r = mockRes(); await auth(req({ method: "POST", body: login }), r);
  assert.equal(r.statusCode, 200);
  const cookie = r.headers["set-cookie"].split(";")[0];
  assert.match(r.headers["set-cookie"], /HttpOnly; Secure/);

  r = mockRes(); await account(req({ headers: { cookie } }), r);
  assert.equal(r.body.user.id, 300); assert.equal(r.body.emcee, null); assert.equal(r.body.emcees.length, 29);

  r = mockRes(); await account(req({ method: "POST", headers: { cookie }, body: { action: "link", emcee: "TBC" } }), r);
  assert.equal(r.statusCode, 400, "TBC can't be claimed");

  r = mockRes(); await account(req({ method: "POST", headers: { cookie }, body: { action: "link", emcee: "Miss Purple" } }), r);
  assert.equal(r.body.delivered, true);
  assert.match(sent(300)[0].params.text, /You're set, Miss Purple/);

  r = mockRes(); await account(req({ headers: { cookie } }), r);
  assert.equal(r.body.emcee, "Miss Purple");

  r = mockRes(); await account(req({ method: "POST", headers: { cookie }, body: { action: "unlink" } }), r);
  r = mockRes(); await account(req({ headers: { cookie } }), r);
  assert.equal(r.body.emcee, null);
});
await test("website: forged login and forged cookie are refused", async () => {
  let r = mockRes(); await auth(req({ method: "POST", body: { id: 1, auth_date: 1, hash: "abc" } }), r);
  assert.equal(r.statusCode, 401);
  r = mockRes(); await account(req({ method: "POST", headers: { cookie: "dc8_session=eyJpZCI6MX0.fake" }, body: { action: "link", emcee: "YQ" } }), r);
  assert.equal(r.statusCode, 401);
});

console.log(`\n${passed} checks passed${process.exitCode ? ", some FAILED" : ""}.`);
