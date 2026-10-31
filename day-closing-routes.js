'use strict';
// day-closing-routes.js — مسارات /api/day-closing/* (التقفيلة). السيرفر بيمرّر ctx؛ الصلاحيات بـ auth.js (GET = ACCT، POST = OWNER/MANAGER).
// التخزين: data.dayClosings (جديد). ملاحظة: data.dailySettlements محجوز لتسويات الرواتب، ما منلمسو.
const DC = require('./day-closing.js');

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MGR = new Set(['OWNER', 'MANAGER']);

function summary(s) {
  const r = s.report || {};
  return {
    id: s.id, number: s.number, type: s.type, day: s.day, closedAt: s.closedAt, closedBy: (s.closedBy && s.closedBy.name) || '', refId: s.refId || null,
    grossCents: r.net ? r.net.grossCents : 0, vatCents: r.vat ? r.vat.vatCents : 0, differenceCents: r.cash && r.cash.differenceCents != null ? r.cash.differenceCents : null,
  };
}

// بيرجّع true إذا المسار إلنا (وبيكون ردّ)
function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (!/^\/api\/day-closing(\/|$)/.test(p)) return false;
  const { readAdminData, writeAdminData, adminId, reply, naraJsonBody, bizDay } = ctx;
  const m = req.method, user = req.naraUser || null, q = k => url.searchParams.get(k);
  const num = k => { const v = q(k); return v === null || v === '' ? undefined : Number(v); };
  const fail = e => { if (e instanceof DC.ClosingError) return reply(res, e.status, { error: e.message, code: e.code }); throw e; };

  if (p === '/api/day-closing/preview' && m === 'GET') {
    const day = q('day') || bizDay.today(), mode = String(q('mode') || '').toUpperCase() === 'TRAINING' ? 'TRAINING' : 'REAL';
    if (!ISO.test(day)) return reply(res, 400, { error: 'Ungültiger Tag.', code: 'BAD_DAY' }), true;
    if (mode === 'TRAINING' && !(user && MGR.has(user.role))) return reply(res, 403, { error: 'Keine Berechtigung.', code: 'FORBIDDEN' }), true;
    const data = readAdminData();
    const report = DC.build(data, day, { mode, openingCents: num('opening'), countedCents: num('counted'), leaveCents: num('leave') });
    reply(res, 200, { ok: true, day, mode, report, status: mode === 'REAL' ? DC.status(data, day) : null });
    return true;
  }

  if (p === '/api/day-closing/list' && m === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(q('limit')) || 60));
    const rows = (readAdminData().dayClosings || []).filter(s => s && s.mode !== 'TRAINING').sort((a, b) => (a.closedAt < b.closedAt ? 1 : -1)).slice(0, limit).map(summary);
    reply(res, 200, { ok: true, rows });
    return true;
  }

  if (p === '/api/day-closing/record' && m === 'GET') {
    const data = readAdminData(), rec = (data.dayClosings || []).find(s => s && s.id === q('id'));
    if (!rec) return reply(res, 404, { error: 'Abschluss nicht gefunden.', code: 'NOT_FOUND' }), true;
    const copies = (data.auditEvents || []).filter(e => e.type === 'CLOSING_REPRINT' && e.details && e.details.settlementId === rec.id).length;
    reply(res, 200, { ok: true, record: rec, copies });
    return true;
  }

  if (p === '/api/day-closing/close' && m === 'POST') {
    naraJsonBody(req, res, 20000, body => {
      const data = readAdminData(), now = new Date().toISOString();
      let record;
      try { record = DC.makeRecord(data, { day: body.day == null ? bizDay.today() : String(body.day), input: body, user, now, newId: adminId }); } catch (e) { return fail(e); }
      data.dayClosings.push(record);
      data.auditEvents.push({ id: adminId('audit'), type: record.type === 'NACHTRAG' ? 'DAY_CLOSING_NACHTRAG' : 'DAY_CLOSING', createdAt: now, details: { settlementId: record.id, number: record.number, day: record.day } });
      writeAdminData(data);
      reply(res, 200, { ok: true, record });
    });
    return true;
  }

  if (p === '/api/day-closing/reprint' && m === 'POST') {
    naraJsonBody(req, res, 2000, body => {
      const data = readAdminData(), rec = (data.dayClosings || []).find(s => s && s.id === String(body.id || ''));
      if (!rec) return reply(res, 404, { error: 'Abschluss nicht gefunden.', code: 'NOT_FOUND' });
      const audit = DC.reprintAudit(data, rec, user, new Date().toISOString(), adminId);
      data.auditEvents.push(audit); writeAdminData(data);
      reply(res, 200, { ok: true, copyNumber: audit.details.copyNumber, record: rec });
    });
    return true;
  }

  if (p === '/api/day-closing/print' && m === 'POST') {
    naraJsonBody(req, res, 2000, body => {
      const data = readAdminData(), rec = (data.dayClosings || []).find(s => s && s.id === String(body.id || ''));
      if (!rec) return reply(res, 404, { error: 'Abschluss nicht gefunden.', code: 'NOT_FOUND' });
      const audit = DC.reprintAudit(data, rec, user, new Date().toISOString(), adminId), copyNumber = audit.details.copyNumber;
      const done = r => { data.auditEvents.push(audit); writeAdminData(data); reply(res, 200, { ok: true, mode: r.mode, copyNumber, record: rec }); };
      if (!ctx.printService || !ctx.printService.printClosing) return done({ mode: 'browser' });
      // أولاً الطباعة، وبعدين التدوين — إذا فشلت الطابعة ما بنحسب نسخة
      Promise.resolve(ctx.printService.printClosing(data, rec, { copyNumber })).then(done, e => reply(res, 502, { error: 'Druck fehlgeschlagen: ' + (e && e.message || e), code: 'PRINT_FAILED' }));
    });
    return true;
  }

  reply(res, 404, { error: 'Unknown day-closing route.' });
  return true;
}

module.exports = { handle, summary };
