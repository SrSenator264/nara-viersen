'use strict';
// approvals.js — "تمام / لا" für heikle Aktionen. Gespeichert in approvals.json (überlebt Neustart). Läuft ab nach 24h.
const fs = require('fs'), path = require('path');
function create({ stateDir, send, now = () => Date.now(), ttlMs = 24 * 3600e3, dryRun = true, runAction }) {
  const file = path.join(stateDir, 'approvals.json');
  let list = []; try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  const save = () => { try { fs.mkdirSync(stateDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(list, null, 1)); } catch (_) {} };
  async function request({ agent, action, payload = {}, title, details = '' }) {
    const id = Math.random().toString(36).slice(2, 8);
    list.push({ id, agent, action, payload, title, at: now(), status: 'pending' }); save();
    await send(`${dryRun ? '🧪 ' : ''}🔐 موافقة مطلوبة\n${title}${details ? '\n' + details : ''}`, { buttons: [[{ text: '✅ تمام', callback_data: `ap:${id}:y` }, { text: '❌ لا', callback_data: `ap:${id}:n` }]] });
    return id;
  }
  async function resolve(id, yes) {
    const r = list.find(x => x.id === id);
    if (!r) return { answer: 'ما لقيت الطلب' };
    if (r.status !== 'pending') return { answer: 'انحلّ من قبل' };
    if (now() - r.at > ttlMs) { r.status = 'expired'; save(); return { answer: 'انتهت صلاحية الطلب' }; }
    r.status = yes ? 'approved' : 'denied'; save();
    if (!yes) return { answer: '❌ ما انعمل شي' };
    if (dryRun) return { answer: '🧪 كان رح ينفّذ (وضع تجربة)' };
    try { await runAction(r.agent, r.action, r.payload); return { answer: '✅ انعمل' }; }
    catch (e) { r.status = 'failed'; save(); return { answer: '⚠️ فشل: ' + String(e.message || e).slice(0, 80) }; }
  }
  return { request, resolve, pending: () => list.filter(x => x.status === 'pending') };
}
module.exports = { create };
