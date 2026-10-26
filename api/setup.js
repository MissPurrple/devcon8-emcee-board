import { isAdmin, webhookSecret } from "../lib/security.js";
import { tg } from "../lib/telegram.js";
import { db, redisConfigured } from "../lib/store.js";

// GET /api/setup?key=ADMIN_SECRET
// Connects the bot to this site and shows a checklist of what is and isn't working.
// Safe to open again at any time (for example after changing a setting).
export default async function handler(req, res) {
  const checks = [];
  const add = (ok, label, help = "") => checks.push({ ok, label, help });

  const hasSecret = (process.env.ADMIN_SECRET || "").trim().length >= 16;
  if (!hasSecret) {
    add(false, "ADMIN_SECRET is set", "Add ADMIN_SECRET (at least 16 characters) in Vercel → Settings → Environment Variables, then redeploy.");
    return page(res, checks, "");
  }
  if (!isAdmin(req)) return res.status(401).send("Wrong or missing key. Open /api/setup?key=YOUR_ADMIN_SECRET");

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const base = `https://${host}`;

  add(Boolean(process.env.TELEGRAM_BOT_TOKEN), "TELEGRAM_BOT_TOKEN is set", "Copy the token BotFather gave you into Vercel's environment variables.");
  add(Boolean(process.env.TELEGRAM_BOT_USERNAME), "TELEGRAM_BOT_USERNAME is set", "The bot's username, e.g. devcon8_mc_bot (without @).");
  add(Boolean(process.env.SITE_URL), "SITE_URL is set (optional)", `Optional. Set it to ${base} so bot messages link to the site.`);

  if (redisConfigured()) {
    try {
      await db().set("setup:ping", Date.now());
      add(true, "Storage (Upstash Redis) is connected");
    } catch (e) {
      add(false, "Storage (Upstash Redis) is connected", `It is added but not answering: ${e.message}`);
    }
  } else {
    add(false, "Storage (Upstash Redis) is connected", "In Vercel: Storage tab → Create/Connect → Upstash for Redis → connect it to this project, then redeploy.");
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const me = await tg("getMe");
      const want = (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "").toLowerCase();
      add(me.username.toLowerCase() === want, `Bot token works (bot is @${me.username})`,
        `TELEGRAM_BOT_USERNAME should be ${me.username}. Fix it in Vercel and redeploy.`);
      await tg("setWebhook", {
        url: `${base}/api/telegram`,
        secret_token: webhookSecret(),
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: true,
      });
      await tg("setMyCommands", {
        commands: [
          { command: "start", description: "Choose your name and turn on reminders" },
          { command: "myshifts", description: "See all your slots" },
          { command: "next", description: "Your next slot" },
          { command: "test", description: "Preview what a reminder looks like" },
          { command: "change", description: "Pick a different name" },
          { command: "stop", description: "Turn off reminders" },
        ],
      });
      const info = await tg("getWebhookInfo");
      add(info.url === `${base}/api/telegram`, "Bot is connected to this site (webhook)", info.last_error_message ? `Telegram reports: ${info.last_error_message}` : "");
    } catch (e) {
      add(false, "Bot token works", `Telegram said: ${e.message}. Check TELEGRAM_BOT_TOKEN.`);
    }
  }
  page(res, checks, host);
}

function page(res, checks, host) {
  const allOk = checks.filter((c) => !c.label.includes("optional")).every((c) => c.ok);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width"><title>Bot setup</title>
<body style="font:16px/1.5 system-ui;max-width:640px;margin:40px auto;padding:0 16px">
<h1>${allOk ? "✅ Setup looks good" : "Setup checklist"}</h1>
<ul style="list-style:none;padding:0">${checks
    .map((c) => `<li style="margin:10px 0">${c.ok ? "✅" : "❌"} <b>${esc(c.label)}</b>${!c.ok && c.help ? `<br><span style="color:#555">${esc(c.help)}</span>` : ""}</li>`)
    .join("")}</ul>
${host ? `<h2>One manual step for the login button</h2><p>In Telegram, message <b>@BotFather</b>, send <code>/setdomain</code>, choose your bot, and send:</p><p><code style="font-size:18px">${esc(host)}</code></p>` : ""}
</body>`);
}
