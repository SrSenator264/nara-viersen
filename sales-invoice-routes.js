'use strict';
// sales-invoice-routes.js — /api/sales-invoices/* (A4-Rechnungen). Speicher: data.salesInvoices. Rechte: auth.js (Erstellen/Ansehen = Kasse, Stornieren/Absender = Inhaber/Manager).
const SI = require('./sales-invoice.js');

const summary = i => ({ id: i.id, number: i.number, status: i.status, issuedAt: i.issuedAt, orderId: i.orderId, orderCode: i.orderCode, customerName: i.customer && i.customer.name, grossCents: i.grossCents });

function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (!/^\/api\/sales-invoices(\/|$)/.test(p)) return false;
  const { readAdminData, writeAdminData, adminId, reply, naraJsonBody } = ctx;
  const m = req.method, user = req.naraUser || null;
  const by = user ? { id: user.id || null, name: user.name || '' } : null;
  const fail = e => { if (e instanceof SI.InvoiceError) return reply(res, e.status, { error: e.message, code: e.code }); throw e; };

  if (p === '/api/sales-invoices/seller' && m === 'GET') { reply(res, 200, { ok: true, seller: SI.sellerOf(readAdminData()) }); return true; }
  if (p === '/api/sales-invoices/seller' && m === 'POST') {
    naraJsonBody(req, res, 2000, b => {
      const data = readAdminData(), cur = SI.sellerOf(data), pick = k => String(b[k] == null ? cur[k] : b[k]).trim().slice(0, 120);
      const next = { name: pick('name'), street: pick('street'), zip: pick('zip'), city: pick('city'), vatId: pick('vatId').toUpperCase().replace(/\s+/g, '') };
      if (!next.name || !next.street || !next.zip || !next.city || !/^[A-Z]{2}[A-Z0-9]{2,14}$/.test(next.vatId)) return reply(res, 400, { error: 'Angaben unvollständig oder USt-IdNr ungültig.', code: 'BAD_SELLER' });
      data.settings = data.settings || {}; data.settings.seller = next;
      data.auditEvents.push({ id: adminId('audit'), type: 'SALES_INVOICE_SELLER_CHANGED', createdAt: new Date().toISOString(), details: { by: by && by.name } });
      writeAdminData(data); reply(res, 200, { ok: true, seller: next });
    });
    return true;
  }

  if (p === '/api/sales-invoices' && m === 'GET') {
    const data = readAdminData(), oid = url.searchParams.get('orderId');
    const list = (data.salesInvoices || []).filter(i => !oid || String(i.orderId) === String(oid)).map(summary);
    reply(res, 200, { ok: true, invoices: list }); return true;
  }

  if (p === '/api/sales-invoices' && m === 'POST') {
    naraJsonBody(req, res, 6000, b => {
      const data = readAdminData(); data.salesInvoices = data.salesInvoices || [];
      const order = (data.orders || []).find(o => String(o.id) === String(b.orderId || ''));
      const active = order && data.salesInvoices.find(i => String(i.orderId) === String(order.id) && i.status === 'ISSUED');
      if (active) return reply(res, 200, { ok: true, existing: true, invoice: active });
      let inv;
      try {
        const now = new Date().toISOString();
        inv = SI.build(data, order, b.customer, { now, id: adminId('sinv'), number: SI.nextNumber(data, now.slice(0, 4)), by });
      } catch (e) { return fail(e); }
      data.salesInvoices.push(inv);
      data.auditEvents.push({ id: adminId('audit'), type: 'SALES_INVOICE_CREATED', orderId: inv.orderId, createdAt: inv.issuedAt, details: { invoiceId: inv.id, number: inv.number, grossCents: inv.grossCents, by: by && by.name } });
      writeAdminData(data);
      reply(res, 200, { ok: true, existing: false, invoice: inv });
    });
    return true;
  }

  let mm = /^\/api\/sales-invoices\/([^/]+)\/html$/.exec(p);
  if (mm && m === 'GET') {
    const inv = (readAdminData().salesInvoices || []).find(i => i.id === decodeURIComponent(mm[1]));
    if (!inv) { reply(res, 404, { error: 'Rechnung nicht gefunden.', code: 'NOT_FOUND' }); return true; }
    const body = SI.html(inv, { autoPrint: url.searchParams.get('print') === '1' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }); res.end(body); return true;
  }

  mm = /^\/api\/sales-invoices\/([^/]+)\/cancel$/.exec(p);
  if (mm && m === 'POST') {
    naraJsonBody(req, res, 2000, b => {
      const data = readAdminData(), inv = (data.salesInvoices || []).find(i => i.id === decodeURIComponent(mm[1]));
      if (!inv) return reply(res, 404, { error: 'Rechnung nicht gefunden.', code: 'NOT_FOUND' });
      if (inv.status === 'CANCELLED') return reply(res, 409, { error: 'Bereits storniert.', code: 'ALREADY_CANCELLED' });
      const reason = String(b.reason || '').trim().slice(0, 200);
      if (!reason) return reply(res, 400, { error: 'Grund fehlt.', code: 'REASON_REQUIRED' });
      inv.status = 'CANCELLED'; inv.cancelledAt = new Date().toISOString(); inv.cancelledBy = by; inv.cancelReason = reason;
      data.auditEvents.push({ id: adminId('audit'), type: 'SALES_INVOICE_CANCELLED', orderId: inv.orderId, createdAt: inv.cancelledAt, details: { invoiceId: inv.id, number: inv.number, reason, by: by && by.name } });
      writeAdminData(data); reply(res, 200, { ok: true, invoice: inv });
    });
    return true;
  }

  reply(res, 404, { error: 'Not found.' }); return true;
}
module.exports = { handle };
