'use strict';
// telegram-accounting.js — المحاسبة من التلغرام:
//   📸 صورة أو PDF فاتورة (من شات التنبيهات أو شات المالك) ← بتنحفظ كمستند بانتظار المراجعة بصفحة المشتريات.
//   💬 سؤال نصي من شات المالك بس (TELEGRAM_OWNER_CHAT_ID) ← المحاسب الذكي بيجاوب. بشات الموظفين النص بيتجاهل.
const MAX_BYTES = 20 * 1024 * 1024;
const MIME = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

function pickFile(msg) {
  if (Array.isArray(msg.photo) && msg.photo.length) { const p = msg.photo[msg.photo.length - 1]; return { fileId: p.file_id, size: p.file_size || 0, mime: 'image/jpeg', name: 'telegram-photo.jpg' }; }
  const d = msg.document;
  if (d && MIME[d.mime_type]) return { fileId: d.file_id, size: d.file_size || 0, mime: d.mime_type, name: String(d.file_name || 'telegram' + MIME[d.mime_type]).slice(0, 200) };
  if (d) return { unsupported: true };
  return null;
}

async function handleMessage(msg, { download, isOwner, who }, { saveDocument, askAgent, history }) {
  const f = pickFile(msg);
  if (f && f.unsupported) return '⚠️ بس PDF أو صورة (JPG/PNG) للفواتير.';
  if (f) {
    if (f.size > MAX_BYTES) return '⚠️ الملف أكبر من 20 MB.';
    const got = await download(f.fileId);
    if (!got || !got.buffer || !got.buffer.length) return '⚠️ ما قدرت نزّل الملف، جرّب كمان مرة.';
    if (got.buffer.length > MAX_BYTES) return '⚠️ الملف أكبر من 20 MB.';
    const doc = saveDocument({ buffer: got.buffer, filename: f.name, mime: f.mime, ext: MIME[f.mime], caption: String(msg.caption || '').slice(0, 300), who });
    return `🧾 وصلت الفاتورة (${doc.id.slice(-6)}). افتح «المشتريات والفواتير» بـ Flamo لتقراها وتراجعها.`;
  }
  const text = String(msg.text || '').trim();
  if (!text || !isOwner) return null;
  const r = await askAgent(text, history ? history(String(msg.chat.id)) : []);
  return r;
}

// ذاكرة قصيرة للمحادثة بالتلغرام (آخر 6 رسائل لكل شات، بالذاكرة بس)
function memory(limit = 6) {
  const m = new Map();
  return {
    get: chat => (m.get(chat) || []).slice(),
    push: (chat, role, text) => { const a = m.get(chat) || []; a.push({ role, text: String(text).slice(0, 2000) }); while (a.length > limit) a.shift(); m.set(chat, a); },
  };
}

module.exports = { handleMessage, pickFile, memory, MAX_BYTES };
