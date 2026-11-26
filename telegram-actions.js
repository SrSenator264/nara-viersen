'use strict';
// telegram-actions.js — بيستقبل ضغطات الأزرار من رسائل التلغرام (long polling: السيرفر هو اللي بيسأل تلغرام، ما بيحتاج رابط عام).
// بيقبل الضغطات بس من الشاتات المضبوطة (TELEGRAM_CHAT_ID، ممكن أكتر من واحد بفاصلة). وأمر /id بيردّ برقم الشات. ما في تلغرام مضبوط = ما بيشتغل.
// onAction(data, whoName) → { answer, edit? } | null
// onMessage(msg, { reply, download, isOwner, role, chatId, sendDocument }) → اختياري: رسائل (صور/ملفات/نص) من الشاتات المسموحة
//   role: OWNER (TELEGRAM_OWNER_CHAT_ID) | PARTNER (TELEGRAM_PARTNER_CHAT_ID) | STAFF (TELEGRAM_CHAT_ID)
function create({ env = process.env, fetchFn = (...a) => fetch(...a), onAction, onMessage = null, log = console.error, pollSec = 25 } = {}) {
  let offset = 0, stopped = false, running = false;
  const ids = () => String(env.TELEGRAM_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  const ownerIds = () => String(env.TELEGRAM_OWNER_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  const partnerIds = () => String(env.TELEGRAM_PARTNER_CHAT_ID || '').split(',').map(x => x.trim()).filter(Boolean);
  // OWNER > PARTNER > STAFF (alerts chat); null = unknown chat
  const roleOf = chat => ownerIds().includes(chat) ? 'OWNER' : partnerIds().includes(chat) ? 'PARTNER' : ids().includes(chat) ? 'STAFF' : null;
  const configured = () => !!(env.TELEGRAM_BOT_TOKEN && (ids().length || ownerIds().length || partnerIds().length));
  // a real file into the chat (multipart); returns true when Telegram accepted it
  async function sendDocument(chatId, { buffer, filename, caption }) {
    const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
    const fd = new FormData();
    fd.append('chat_id', String(chatId));
    if (caption) fd.append('caption', String(caption).slice(0, 1000));
    fd.append('document', new Blob([buffer]), String(filename || 'document').slice(0, 200));
    try { const r = await fetchFn(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd, signal: AbortSignal.timeout(120000) }); return !!(r && r.ok); } catch { return false; }
  }
  // ملف من تلغرام (حد البوت 20 MB)
  async function download(fileId) {
    const j = await api('getFile', { file_id: fileId });
    const p = j && j.result && j.result.file_path; if (!p) return null;
    const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
    const r = await fetchFn(`${base}/file/bot${env.TELEGRAM_BOT_TOKEN}/${p}`, { signal: AbortSignal.timeout(60000) });
    return r.ok ? { buffer: Buffer.from(await r.arrayBuffer()), path: p } : null;
  }
  const api = async (method, body, timeoutMs = 10000) => {
    const base = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
    const r = await fetchFn(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? r.json() : null;
  };
  const nameOf = f => [f && f.first_name, f && f.last_name].filter(Boolean).join(' ').slice(0, 40) || (f && f.username) || '';

  async function handle(update) {
    // /id (من أي شات): البوت بيردّ برقم الشات، لتضيفه لـ TELEGRAM_CHAT_ID. ما بيكشف شي غير الرقم.
    const msg = update && update.message;
    if (msg && msg.chat && /^\/id(@\w+)?\s*$/i.test(String(msg.text || '').trim())) {
      await api('sendMessage', { chat_id: msg.chat.id, text: `رقم هالشات: ${msg.chat.id}` }).catch(() => {});
      return true;
    }
    if (msg && msg.chat && onMessage && !/^\//.test(String(msg.text || ''))) {
      const chat = String(msg.chat.id), role = roleOf(chat), isOwner = role === 'OWNER';
      if (role) {
        const reply = text => api('sendMessage', { chat_id: msg.chat.id, text: String(text).slice(0, 4000), reply_to_message_id: msg.message_id }).catch(() => {});
        const send = f => sendDocument(msg.chat.id, f);
        try { const out = await onMessage(msg, { reply, download, isOwner, role, chatId: chat, sendDocument: send, who: nameOf(msg.from) }); if (out) await reply(out); } catch (e) { log('[NARA][TG-MSG]', e && e.message); }
        return true;
      }
    }
    const cq = update && update.callback_query;
    if (!cq || !cq.message || !ids().includes(String(cq.message.chat && cq.message.chat.id))) return false;
    let res = null;
    try { res = await onAction(String(cq.data || ''), nameOf(cq.from)); } catch (e) { log('[NARA][TG-ACTION]', e && e.message); }
    await api('answerCallbackQuery', { callback_query_id: cq.id, text: res ? res.answer : '⚠️' }).catch(() => {});
    if (res && res.edit) {
      const base = String(cq.message.text || '').split('\n✅ انطلب')[0].split('\n⏳ لسا')[0];
      // "لسا": الأزرار بتضل (انطلب لسا شغال). "انطلب": بنشيل الأزرار.
      const markup = res.keepButtons && cq.message.reply_markup ? cq.message.reply_markup : { inline_keyboard: [] };
      await api('editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: `${base}\n${res.edit}`, reply_markup: markup }).catch(() => {});
    }
    return true;
  }

  async function pollOnce() {
    const j = await api('getUpdates', { offset, timeout: pollSec, allowed_updates: ['callback_query', 'message'] }, (pollSec + 10) * 1000);
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
  return { handle, pollOnce, download, sendDocument, roleOf, start: () => { stopped = false; loop(); }, stop: () => { stopped = true; }, configured };
}
module.exports = { create };
