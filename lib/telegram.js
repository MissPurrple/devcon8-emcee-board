// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
let transport = null; // tests replace this to capture calls instead of hitting Telegram

export function useTelegramForTests(fn) {
  transport = fn;
}

export async function tg(method, params = {}) {
  if (transport) return transport(method, params);
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing (README step 5).");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await r.json().catch(() => ({ ok: false, description: `HTTP ${r.status}` }));
  if (!data.ok) {
    const err = new Error(`Telegram ${method} failed: ${data.description || r.status}`);
    err.code = data.error_code;
    throw err;
  }
  return data.result;
}

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sends an HTML-formatted message. Returns true if delivered, false if the person hasn't started the bot / blocked it. */
export async function send(chatId, html, extra = {}) {
  try {
    await tg("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
    return true;
  } catch (e) {
    if (e.code === 403 || e.code === 400) return false;
    throw e;
  }
}
