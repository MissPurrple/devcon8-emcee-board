# Devcon 8 Emcee Board + Reminder Bot

A small website showing the Devcon 8 MC schedule (by day, stage and time, with hours per emcee), plus a Telegram bot that:

1. sends each emcee their full list of slots as soon as they pick their name, and
2. reminds them **2 hours** and **1 hour** before every slot, with the stage, day, times, topic and the time to be at the stage.

People can sign up in two ways: **"Log in with Telegram"** on the website, or by opening the bot and pressing **Start**.

Setup takes about 30–45 minutes. You need no coding. Do the steps in order, and don't skip the check in step 6.

---

## What you need before starting

- The **Telegram app** on your phone or computer.
- A free **GitHub** account: https://github.com/signup
- A free **Vercel** account: https://vercel.com/signup (choose "Continue with GitHub").
- A free **cron-job.org** account: https://console.cron-job.org/signup
- This folder, unzipped.

**Keep a note open** (a password manager is ideal). You'll collect four things along the way:

| Name | What it is | Example |
|---|---|---|
| Bot token | Secret key for your bot, from BotFather | `7123456789:AAF...` |
| Bot username | Your bot's @name, without the @ | `devcon8_mc_bot` |
| Admin secret | A password **you invent** | `k7Fq2mPz9XwR4tLb8NvC3hJd` |
| Site address | Given by Vercel in step 3 | `devcon8-emcee.vercel.app` |

For the **admin secret**, make up at least 24 characters using **only letters and numbers** (no spaces or symbols, because it goes inside a web address). Anyone who has it can trigger the admin pages, so don't share it.

---

## Step 1 — Create the bot in Telegram

1. In Telegram, search for **@BotFather** (it has a blue check mark) and open it.
2. Send `/newbot`.
3. When asked for a **name**, send something like `Devcon 8 MC Reminders`. People see this name.
4. When asked for a **username**, send one that ends in `bot`, for example `devcon8_mc_bot`. If it's taken, try another.
5. BotFather replies with a **token** (a long line like `7123456789:AAF...`). Copy it into your note as the **Bot token**. Treat it like a password.
6. Optional: send `/setuserpic` to give the bot a picture.

## Step 2 — Put the code on GitHub

1. Go to https://github.com/new
2. Repository name: `devcon8-emcee-board`. Choose **Private**. Click **Create repository**.
3. On the next page, click the link **"uploading an existing file"**.
4. Open the unzipped folder on your computer. Select **everything inside it** (the `api`, `lib`, `public` and `test` folders, plus `package.json`, `package-lock.json`, `vercel.json` and `README.md`) and drag it onto the GitHub page.
   - Drag the *contents*, not the outer folder itself.
   - On a Mac, `.gitignore` is hidden. That's fine; it's optional.
5. Wait for all files to finish uploading, then click **Commit changes**.
6. Check: the repository's main page should show the folders `api`, `lib`, `public`, `test` and the file `package.json` at the top level.

## Step 3 — Put the site on Vercel

1. Go to https://vercel.com/new
2. Find `devcon8-emcee-board` in the list and click **Import**. (If it isn't listed, click "Adjust GitHub App Permissions" and allow Vercel to see that repository.)
3. **Framework Preset:** leave it as **Other**. Don't change the build settings.
4. Open **Environment Variables** and add these three, one at a time (Name on the left, Value on the right, then **Add**):

   | Name | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | your Bot token |
   | `TELEGRAM_BOT_USERNAME` | your Bot username, without @ |
   | `ADMIN_SECRET` | the password you invented |

5. Click **Deploy** and wait for the confetti.
6. Your site address is shown on the project page under **Domains** (for example `devcon8-emcee-board.vercel.app`). Copy it into your note as the **Site address**.

The schedule already works at this point. Login and reminders need the next steps.

## Step 4 — Add storage (to remember who is who)

1. In your Vercel project, click the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**), choose **Upstash**, then **Upstash for Redis**.
3. Pick the **free** plan and a region close to India (for example Mumbai, `ap-south-1`, if offered). Click through to create it.
4. When asked which project to connect, choose `devcon8-emcee-board`, with all environments ticked. Click **Connect**.

## Step 5 — Add the site address and redeploy

Settings only take effect after a redeploy.

1. Go to **Settings → Environment Variables** and add one more:

   | Name | Value |
   |---|---|
   | `SITE_URL` | `https://` followed by your site address |

2. Go to the **Deployments** tab. On the top deployment, click the **⋯** menu, then **Redeploy**, then **Redeploy** again. Wait until it says **Ready**.

## Step 6 — Run the setup check

1. In your browser, open this address, replacing the two parts in capitals:

   `https://SITE-ADDRESS/api/setup?key=ADMIN-SECRET`

2. You should see **"✅ Setup looks good"** and a list of green ticks. This page also connects the bot to your site, so it must be opened at least once.
3. If anything shows ❌, the line under it says how to fix it. Fix it, redeploy (step 5.2), and open the page again. It's safe to open as many times as you like.

## Step 7 — Allow the login button on your site

The setup page ends with your domain. Then:

1. In Telegram, open **@BotFather** and send `/setdomain`.
2. Choose your bot.
3. Send your site address **without** `https://`, for example `devcon8-emcee-board.vercel.app`.

Without this, the website's "Log in with Telegram" button says "Bot domain invalid".

## Step 8 — Turn on the reminder timer

Vercel's free plan can only run a scheduled job once a day, which isn't enough for reminders. A free service, cron-job.org, will open a special page on your site every 5 minutes, and that page sends any reminders that are due.

1. Log in at https://console.cron-job.org and click **Create cronjob**.
2. **Title:** `Devcon emcee reminders`
3. **URL:** `https://SITE-ADDRESS/api/cron?key=ADMIN-SECRET` (same replacements as step 6).
4. **Execution schedule:** choose **Every 5 minutes**.
5. Optional but recommended: in the notification settings, turn on the email alert for when the job fails.
6. Click **Create**. Then use **Test run**. A good result shows status **200** and a reply like `{"checkedPeople":0,"sent":0,...}`.

The timer is safe to run more often (every minute works too). Nothing is ever sent twice.

> **On Vercel Pro instead?** You can skip cron-job.org. In Vercel, add an environment variable `CRON_SECRET` (any long letters-and-numbers password), and replace `vercel.json` with:
> ```json
> { "outputDirectory": "public", "crons": [{ "path": "/api/cron", "schedule": "*/5 * * * *" }] }
> ```
> Then redeploy.

## Step 9 — Test it yourself

1. Open your site. In the box under "Call time", click **Log in with Telegram** and confirm in Telegram. Allow the bot to message you.
2. Pick your name and click **This is me**. Within a few seconds the bot should message you your list of slots.
3. In the bot, try `/next` (your next slot) and `/test` (a preview of what a reminder looks like).
4. Also test the bot-only route: on another Telegram account, open `https://t.me/BOT-USERNAME`, press **Start**, and tap a name.

## Step 10 — Share with the emcees

Send them two links: your site address, and `https://t.me/BOT-USERNAME`. Tell them:

> Open the bot, press **Start**, and tap your name. You'll get your slots straight away, plus reminders 2 hours and 1 hour before each one. Or log in with Telegram on the website.

The bot can only message people who have pressed Start or logged in on the site and allowed messages. Telegram doesn't let bots message anyone else.

---

## Bot commands

| Command | What it does |
|---|---|
| `/start` | Choose your name and turn reminders on |
| `/myshifts` | Your full list of slots |
| `/next` | Your next slot and how long until it starts |
| `/test` | Preview what a reminder looks like |
| `/change` | Pick a different name |
| `/stop` | Turn reminders off |

## Updating the schedule or adding speakers

All slots live in one file: `lib/sessions-data.js`.

1. On GitHub, open that file and click the **pencil** (Edit) icon.
2. Make the change and click **Commit changes**. Vercel republishes the site by itself within about a minute.

Each slot is one line, for example:

```js
{"day": 3, "stage": "L3", "start": "14:30", "end": "15:30", "tracks": "Permissionless Networks", "emcee": "Dmitrii Gusakov", "id": 41},
```

- `day`: 1 = Tue 3 Nov … 4 = Fri 6 Nov
- `stage`: `Main`, `L1`, `L2`, `L3` (Lotus 1–3), `J4` (Jasmine 4), `LT` (Lightning), `W1`, `W2` (Workshops)
- `start` / `end`: 24-hour Mumbai time, always 5 characters (`09:30`, `14:00`)
- `emcee`: must be spelled exactly the same in every slot for that person
- `id`: a unique number. **Never change or reuse an existing id**: reminders that were already sent are remembered by id.

To add talks once the Devcon Passport is live, add a `talks` list to a slot. They then appear in the bot's messages and reminders:

```js
{"day": 3, ..., "id": 41, "talks": [{"title": "Talk name", "speaker": "Speaker name", "start": "14:35", "end": "14:55"}]},
```

Or send the Passport details to Claude and ask for the file to be updated.

## Troubleshooting

| Problem | Fix |
|---|---|
| Login button says **"Bot domain invalid"** | Do step 7. The domain must match exactly, without `https://`. |
| Login button doesn't appear | Check `TELEGRAM_BOT_USERNAME` is correct, then redeploy. Open the setup page (step 6). |
| Bot doesn't answer `/start` | Open the setup page (step 6). It reconnects the bot and shows the error Telegram reports. |
| Someone gets no reminders | They must have pressed Start in the bot (or allowed messages at login). Ask them to send `/next` to check the bot knows their name. |
| Reminders stopped | Check cron-job.org: it pauses a job after 25 failures in a row. Do a **Test run** and look at the result. |
| Setup page says storage isn't connected | Redo step 4, then redeploy (step 5.2). |
| You changed a setting and nothing happened | Settings need a redeploy (step 5.2). |

## Good to know

- **Times** are Mumbai time (IST). Reminders count from the slot start time on the MC sheet; the Devcon Passport has exact session timings.
- **Anyone can tap any name.** The only effect is that they'd also receive that person's reminders; nobody can change the schedule from the bot or the site. Several people can pick the same name.
- **Clashes:** Alessandro's two Day 4 morning slots are both on the sheet, so his reminders include a warning about the clash.
- **What's stored:** each person's Telegram ID, first name, username and chosen emcee name, in your Upstash database. Nothing else.
- **Vercel's free plan** is meant for personal, non-commercial projects. If this runs on behalf of an organisation, check Vercel's terms or use Pro.
- **Checks:** `npm test` runs 22 automated checks (login security, every bot command, and reminders across the whole event) using fake Telegram and storage. You don't need to run them to deploy.

---

vibe build: miss purple · original source: ross
