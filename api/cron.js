import { isAdmin } from "../lib/security.js";
import { runReminders } from "../lib/reminders.js";

// GET /api/cron?key=ADMIN_SECRET — called every 5 minutes by the timer (cron-job.org or Vercel Cron).
// Sends any reminders that are due. Safe to call as often as you like: nothing is sent twice.
export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: "Wrong or missing key" });
  const summary = await runReminders();
  console.log("reminders", summary);
  res.status(200).json(summary);
}
