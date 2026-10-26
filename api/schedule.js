import { SESSIONS, DAYS, STAGES } from "../lib/schedule.js";

// GET /api/schedule — the schedule the website draws.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  res.status(200).json({ sessions: SESSIONS, days: DAYS, stages: STAGES });
}
