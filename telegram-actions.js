'use strict';
// telegram-actions.js — بيستقبل ضغطات الأزرار من رسائل التلغرام (long polling: السيرفر هو اللي بيسأل تلغرام، ما بيحتاج رابط عام).
// بيقبل بس الضغطات من نفس الجروب/الشات المضبوط (TELEGRAM_CHAT_ID). ما في تلغرام مضبوط = ما بيشتغل.
// onAction(data, whoName) → { answer, edit? } | null
function create({ env = process.env, fetchFn = (...a) => fetch(...a), onAction, log = console.error, pollSec = 25 } = {}) {
  let offset = 0, stopped = false, running = false;
  const configured = () => !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  const api = async (method, body, timeoutMs = 10000) => {
    const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
    const r = await fetchFn(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? r.json() : null;
  };
  const nameOf = f => [f && f.first_name, f && f.last_name].filter(Boolean).join(' ').slice(0, 40) || (f && f.username) || '';

  async function handle(update) {
    const cq = update && update.callback_query;
    if (!cq || !cq.message || String(cq.message.chat && cq.message.chat.id) !== String(env.TELEGRAM_CHAT_ID)) return false;
    let res = null;
    try { res = await onAction(String(cq.data || ''), nameOf(cq.from)); } catch (e) { log('[NARA][TG-ACTION]', e && e.message); }
    await api('answerCallbackQuery', { callback_query_id: cq.id, text: res ? res.answer : '⚠️' }).catch(() => {});
    if (res && res.edit) {
      const base = String(cq.message.text || '').split('\n✅ انطلب')[0];
      await api('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${base}\n${res.edit}`, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    }
    return true;
  }

  async function pollOnce() {
    const j = await api('getUpdates', { offset, timeout: pollSec, allowed_updates: ['callback_query'] }, (pollSec + 10) * 1000);
    if (!j || !Array.isArray(j.result)) return -1; // فشل: اللوب بيستنى قبل المحاولة الجاية
    for (const u of j.result) { offset = Math.max(offset, u.update_id + 1); await handle(u); }
    return j.result.length;
  }
  async function loop() {
    if (running || !configured()) return; running = true;
    while (!stopped) {
      let n = -1; try { n = await pollOnce(); } catch (e) { /* شبكة */ }
      if (n < 0) await new Promise(r => setTimeout(r, 15000));
    }
    running = false;
  }
  return { handle, pollOnce, start: () => { stopped = false; loop(); }, stop: () => { stopped = true; }, configured };
}
module.exports = { create };
