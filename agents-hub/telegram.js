'use strict';
// telegram.js — senden + Befehle/Knöpfe empfangen (Long-Polling). Nur erlaubte Chat-IDs (TELEGRAM_CHAT_ID) werden bedient.
function create({ env = process.env, fetchFn = (...a) => fetch(...a), onCallback, onCommand, log = console.error, pollSec = 25 } = {}) {
  const ids = () => String(env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  const configured = () => !!(env.TELEGRAM_BOT_TOKEN && ids().length);
  const base = () => `${String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '')}/bot${env.TELEGRAM_BOT_TOKEN}`;
  const clean = e => String(e && e.message || e).split(String(env.TELEGRAM_BOT_TOKEN || '\u0000')).join('***');
  async function api(method, body, ms = 10000) {
    const r = await fetchFn(`${base()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
    if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
    return r.json();
  }
  async function send(text, { buttons = null } = {}) {
    if (!configured()) { log('[HUB][MSG]', text); return { sent: false, reason: 'not-configured' }; }
    let n = 0;
    for (const chat of ids()) { try { await api('sendMessage', Object.assign({ chat_id: chat, text: String(text).slice(0, 3500), disable_web_page_preview: true }, buttons ? { reply_markup: { inline_keyboard: buttons } } : {})); n++; } catch (e) { log('[HUB] Telegram:', clean(e)); } }
    return { sent: n > 0 };
  }
  async function handle(u) {
    const cq = u && u.callback_query, msg = u && u.message;
    const chat = String((cq && cq.message && cq.message.chat && cq.message.chat.id) || (msg && msg.chat && msg.chat.id) || '');
    if (!ids().includes(chat)) return; // Fremde ignorieren
    if (cq && onCallback) {
      const res = await onCallback(String(cq.data || '')); await api('answerCallbackQuery', { callback_query_id: cq.id, text: (res && res.answer) || '✔️' }).catch(() => {}); return;
    }
    if (msg && msg.text && msg.text[0] === '/' && onCommand) { const [cmd, ...args] = msg.text.trim().split(/\s+/); const r = await onCommand(cmd.split('@')[0].toLowerCase(), args); if (r) await send(r); }
  }
  let running = false, offset = 0;
  async function loop() {
    running = true;
    while (running && configured()) {
      try { const j = await api('getUpdates', { offset, timeout: pollSec, allowed_updates: ['callback_query', 'message'] }, (pollSec + 10) * 1000); for (const u of (j.result || [])) { offset = u.update_id + 1; await handle(u).catch(e => log('[HUB]', clean(e))); } }
      catch (e) { log('[HUB] poll:', clean(e)); await new Promise(r => setTimeout(r, 5000)); }
    }
  }
  return { send, configured, handle, start: () => { if (!running) loop(); }, stop: () => { running = false; } };
}
module.exports = { create };
