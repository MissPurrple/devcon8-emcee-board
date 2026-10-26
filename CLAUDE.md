# CLAUDE.md — Devcon 8 Emcee Board + Reminder Bot

Instructions for Claude Code working in this folder. Read all of it before doing anything.

## Who you're working with

The owner (Miss Purple, an emcee and organiser at Devcon 8) is **new to coding and deployment**. So:

- Explain each step in plain words before doing it, and say what you'll need from them.
- Do **one step at a time**. When a step needs the human (logging in, Telegram, a website form), stop, give numbered click-by-click instructions, and wait for them to say it's done.
- After every step, **verify it worked** with a command and report the result in one line. Never assume success.
- Don't use jargon without a short explanation ("environment variable — a setting stored on Vercel, not in the code").
- If something fails, say what failed, why (in plain words), and the fix. Don't retry the same thing more than twice; ask instead.

## What this project is

- `public/index.html` — the website: the MC schedule by day/stage/time, hours per emcee, and a "Log in with Telegram" box where emcees pick their name. It loads data from `/api/schedule`.
- A Telegram bot. When someone links their name, it sends their full list of slots. Then it reminds them **2 hours** and **1 hour** before each slot (stage, day, times, topic, "be at the stage by" = 30 min before).
- Hosted on **Vercel** (static site + serverless functions in `api/`). Storage is **Upstash Redis** from the Vercel Marketplace.
- Reminders are sent by `/api/cron`, which must be called every 5 minutes by an outside timer (cron-job.org, free). Vercel's free Hobby plan only allows cron once a day, so don't put a sub-daily cron in `vercel.json` unless the owner confirms they're on Vercel Pro.

### Files

| Path | Purpose |
|---|---|
| `lib/sessions-data.js` | **The schedule.** 64 slots, one per line. The only file to edit for schedule/speaker changes. |
| `lib/schedule.js` | Time helpers. Venue time is Mumbai, IST = UTC+05:30. Day 1 = Tue 3 Nov 2026. |
| `lib/messages.js` | Wording of every bot message. |
| `lib/reminders.js` | Reminder timing. 2h reminder when 60 < minutes left ≤ 120; 1h when 0 < left ≤ 60. `activate()` pre-marks windows already open so late sign-ups aren't spammed. |
| `lib/store.js` | Upstash Redis access. Accepts `KV_REST_API_URL/TOKEN` or `UPSTASH_REDIS_REST_URL/TOKEN`. |
| `lib/security.js` | Telegram login hash check, webhook secret, admin key, login cookie. All derived from `ADMIN_SECRET`. |
| `lib/telegram.js` | Bot API calls. |
| `api/schedule.js` | GET schedule JSON for the site. |
| `api/auth.js` | POST from the Telegram login button; verifies and sets cookie. |
| `api/account.js` | GET who's logged in; POST link/unlink/logout. |
| `api/telegram.js` | Bot webhook (commands: /start /myshifts /next /test /change /stop). |
| `api/cron.js` | Sends due reminders. Needs `?key=ADMIN_SECRET` or `Authorization: Bearer <ADMIN_SECRET or CRON_SECRET>`. |
| `api/setup.js` | Admin page: checks settings, connects the bot webhook, sets bot commands. `?key=ADMIN_SECRET`. Safe to rerun. |
| `test/run-tests.js` | 22 checks with fake Telegram + storage. `npm test`. |
| `README.md` | The same setup as a manual, click-by-click guide (no Claude Code). |

### Settings (Vercel environment variables, Production)

| Name | Source |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Secret. |
| `TELEGRAM_BOT_USERNAME` | Bot's username without `@`. |
| `ADMIN_SECRET` | You generate it: 32 random letters/digits only (it goes in URLs). Secret. |
| `SITE_URL` | `https://<production domain>`. Optional; bot messages link to it. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_…`) | Added automatically when Upstash is connected. |
| `CRON_SECRET` | Only if using Vercel Pro cron instead of cron-job.org. |

## Rules (always)

1. **Secrets never appear in your chat output, in commits, or in files outside `.secrets/`.** Keep them in `.secrets/` (gitignored and vercelignored). Give them to Vercel by redirect: `vercel env add NAME production < .secrets/file.txt`. Inside a local command it's fine to read one with `$(cat .secrets/…)`, but never run anything whose output would print the value (no bare `cat`/`echo` of a secret, no printing a URL that contains it). When the owner needs a secret, tell them which file to open.
2. **Run `npm test` before every deploy.** It must print `22 checks passed.` If it doesn't, stop and fix or explain.
3. **Never change or reuse an `id` in `lib/sessions-data.js`.** Sent reminders are remembered by id. New slots get the next unused number.
4. Times in the data are 24-hour, 5 characters (`09:30`), Mumbai local time. `stage` codes: `Main L1 L2 L3 J4 LT W1 W2`. Emcee names must be spelled identically across their slots.
5. Keep the footer signature on the site: `vibe build: miss purple · original source: ross`.
6. Keep the visual markers: orange **!** = needs checking (Day 3 workshop names were printed grey in the source PDF); red triangle = double booking (Alessandro, Day 4, Lotus 1 and Workshop 2, 10am–1pm). The Day 1 "name listed twice" is **not** an issue: those are single 2pm–5:30pm slots.
7. Settings changes need a redeploy: `vercel deploy --prod`.
8. Don't create accounts, accept terms, or log in on the owner's behalf. Those are their steps.
9. Don't commit `.secrets/`, `.env*`, `.vercel/` or `node_modules/`.

## First-time deployment runbook

Use the task list to track these. Tell the owner at the start which steps are theirs (marked **[OWNER]**) so they know what's coming.

### 0. Check the tools
- `node -v` (needs 18+). If missing, explain how to install Node.js LTS from nodejs.org and wait.
- `npm install`
- `npm test` → `22 checks passed.`
- `npx vercel --version` (use `npx vercel` everywhere if `vercel` isn't installed globally; offer `npm i -g vercel`).
- Make sure `.gitignore` and `.vercelignore` both list `.secrets`. Create `.secrets/` if missing.

### 1. [OWNER] Create the Telegram bot
Give these instructions, then wait:
1. In Telegram, open **@BotFather** (blue check mark). Send `/newbot`.
2. Name: e.g. `Devcon 8 MC Reminders`. Username: must end in `bot`, e.g. `devcon8_mc_bot`.
3. Copy the token BotFather sends. **Don't paste it in this chat.** Instead, create the file `.secrets/bot-token.txt` in this folder and paste the token in as its only line, then save. (Offer to create the empty file and open it for them.)
4. Tell me the bot's username (that part isn't secret).

Verify: the token file exists and isn't empty (check `wc -c`, don't print it). A trailing line break from their editor is fine; the code trims it. Verify the token works without printing it:
`curl -s "https://api.telegram.org/bot$(cat .secrets/bot-token.txt)/getMe"`, then show only the `username` field from the JSON. It should match what they said.
Save the username to `.secrets/bot-username.txt` (not secret, but kept together).

### 2. Generate the admin secret
`LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 > .secrets/admin-secret.txt`
Tell the owner it's saved in `.secrets/admin-secret.txt` and to also store it in their password manager.

### 3. [OWNER] Log in to Vercel
Run `vercel login`. It opens a browser; they approve. If they have no account, they sign up at vercel.com (Continue with GitHub is fine). Verify with `vercel whoami`.

### 4. Create the Vercel project and first deploy
- `vercel link` (project name `devcon8-emcee-board`; framework "Other"; accept the defaults). If it asks questions you can't answer from this file, ask the owner.
- Add settings:
  - `vercel env add TELEGRAM_BOT_TOKEN production < .secrets/bot-token.txt`
  - `vercel env add TELEGRAM_BOT_USERNAME production < .secrets/bot-username.txt`
  - `vercel env add ADMIN_SECRET production < .secrets/admin-secret.txt`
- `vercel deploy --prod`. Note the production domain (e.g. `devcon8-emcee-board.vercel.app`); use the stable project domain, not the per-deployment URL.
- Add `SITE_URL`: write `https://<domain>` to `.secrets/site-url.txt` (no trailing newline), then `vercel env add SITE_URL production < .secrets/site-url.txt`.
- Verify: `curl -s https://<domain>/api/schedule` has 64 `sessions`. Tell the owner the site is live and give the link.

### 5. Add storage (Upstash Redis)
- `vercel integration add upstash/upstash-redis --help` to see the required fields.
- Add it, choosing a Mumbai region if offered (Vercel's code for Mumbai is `bom1`), e.g. `vercel integration add upstash/upstash-redis -m primaryRegion=bom1`.
- If it pauses for terms or a plan choice, that's an **[OWNER]** moment: explain and let them choose the **free** plan in the browser.
- Make sure it's connected to this project for Production. Verify with `vercel env ls production`: `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the `UPSTASH_` pair) must be listed.
- If the CLI route fails, fall back to the dashboard: Project → Storage → Create Database → Upstash for Redis → Free → connect to this project. Give click-by-click steps and wait.
- Redeploy: `vercel deploy --prod`.

### 6. Run the setup check
Request `https://<domain>/api/setup?key=<admin secret from file>` with curl. Build the URL from the file inside the command; don't print it. Read the HTML for ✅/❌. All lines except the optional one must be ✅. Fix any ❌ using the help text, redeploy, and recheck. This call also connects the bot's webhook, so it must succeed at least once.

### 7. [OWNER] Allow the login button's domain
Tell them: in Telegram, open @BotFather, send `/setdomain`, choose the bot, send the domain **without** `https://` (give them the exact text to paste). Without this, the site's login button shows "Bot domain invalid".

### 8. [OWNER] Turn on the reminder timer (cron-job.org)
Explain why: Vercel's free plan can't run jobs more often than daily.
1. They sign up / log in at https://console.cron-job.org
2. **Create cronjob.** Title `Devcon emcee reminders`. URL: `https://<domain>/api/cron`.
3. In the advanced/headers section, add header `Authorization` with value `Bearer ` followed by the admin secret. (Tell them to open `.secrets/admin-secret.txt` and copy it themselves.) This keeps the secret out of the URL. If they can't find headers, the fallback is the URL `https://<domain>/api/cron?key=<admin secret>`.
4. Schedule: every 5 minutes. Turn on the failure email alert. Save, then **Test run**: expect status 200 and JSON like `{"checkedPeople":0,"sent":0,...}`.

Verify yourself too: `curl -s -H "Authorization: Bearer $(cat .secrets/admin-secret.txt)" https://<domain>/api/cron` should return that JSON.

If the owner says they're on **Vercel Pro**, skip cron-job.org instead: generate `.secrets/cron-secret.txt` the same way as the admin secret, `vercel env add CRON_SECRET production < .secrets/cron-secret.txt`, add `"crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }]` to `vercel.json`, test, and redeploy.

### 9. [OWNER] End-to-end test
Ask them to:
1. Open the site, click **Log in with Telegram**, approve, allow messages.
2. Pick their name → **This is me**. The bot should message their slot list within seconds.
3. In the bot, send `/next` and `/test`.
Ask them to confirm each worked. If the bot is silent, rerun step 6 and read the webhook line.

### 10. Hand-off
Give them, in plain words: the site link, the bot link `https://t.me/<username>`, a ready-to-forward message for emcees ("Open the bot, press Start, tap your name…"), and where their secrets are saved. Offer optional extras: connecting a GitHub repo (`vercel git connect`) so edits on GitHub auto-deploy, or a custom domain (then redo step 7 with the new domain).

## Routine tasks

**Update the schedule or add speakers** (e.g. from the Devcon Passport once live):
- Edit `lib/sessions-data.js` only. Talks go on a slot as:
  `"talks": [{"title": "…", "speaker": "…", "start": "14:35", "end": "14:55"}]`
- Talks appear automatically in bot messages, reminders, and the website's per-emcee panel (which shows "Speakers and talks: not added yet" until a slot has talks).
- If slots change, re-verify totals against the source, run `npm test` (update the expected counts/totals in the test if the schedule legitimately changed, and say so), deploy, and summarise the changes for the owner.
- If a slot that people are already subscribed to changes time, tell the owner: reminders follow the new time automatically, but nobody gets an "updated" message unless asked. Offer to send one.

**Check the bot is healthy:** rerun step 6 and the curl in step 8.

**See who has signed up:** don't build a public page for this. If asked, read from Redis with the Upstash credentials (`vercel env pull .env.local --environment=production --yes`, then a small Node script with `@upstash/redis`). Report names only. Delete `.env.local` afterwards.

**After the event:** offer to turn off the cron-job.org job and, if they want, delete stored data.
