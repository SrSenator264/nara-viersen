'use strict';
// alerts.js — Warnungen aufs Handy (Telegram). Zugangsdaten NUR in .env (nie im Code/Git):
//   TELEGRAM_BOT_TOKEN=...   (von @BotFather)      TELEGRAM_CHAT_ID=...   (deine Chat-ID)
// Ohne Zugangsdaten: nur Logzeile + Eintrag in der Statusseite. Gleiche Warnung (key) wird nur alle 30 min gesendet.
function create({ env = process.env, fetchFn = (...a) => fetch(...a), now = () => Date.now(), log = console.error, dedupeMs = 30 * 60000 } = {}) {
  const last = new Map(), recent = [];
  const configured = () => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

  async function send(key, text, { level = 'warn', force = false } = {}) {
    const t = now(), prev = last.get(key);
    if (!force && prev != null && t - prev < dedupeMs) return { sent: false, reason: 'deduped' };
    last.set(key, t);
    const entry = { at: new Date(t).toISOString(), key, level, text: String(text).slice(0, 500), delivered: false };
    recent.unshift(entry); if (recent.length > 30) recent.length = 30;
    if (!configured()) { log('[NARA][ALERT]', entry.text); return { sent: false, reason: 'not-configured' }; }
    try {
      const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
      const r = await fetchFn(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: String(text).slice(0, 3500), disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { log('[NARA][ALERT] Telegram HTTP', r.status); entry.error = 'HTTP ' + r.status; return { sent: false, reason: 'http-' + r.status }; }
      entry.delivered = true; return { sent: true };
    } catch (e) {
      entry.error = String(e && e.message || e).replace(String(env.TELEGRAM_BOT_TOKEN || '\u0000'), '***'); // Token nie ins Log
      log('[NARA][ALERT] Telegram nicht erreichbar:', entry.error);
      return { sent: false, reason: 'network' };
    }
  }
  return { send, configured, recent: () => recent.slice(), _last: last };
}
module.exports = { create };
