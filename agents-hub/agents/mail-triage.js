'use strict';
// mail-triage.js — sortiert neue Mails nach Wichtigkeit. Quelle: Ordner MAIL_INBOX_DIR, in den der mail-agent (NAS) pro Mail eine .json legt:
//   { "id","from","subject","date","snippet","hasAttachment" }   Verarbeitete wandern nach processed/. Nur lesen + melden.
const fs = require('fs'), path = require('path');
const RULES = [
  { re: /telekom/i, tag: 'Telekom' }, { re: /bgn|berufsgenossenschaft|asd/i, tag: 'BGN' }, { re: /\bewe\b|logoenergie|stadtwerke/i, tag: 'Strom/Gas' },
  { re: /finanzamt|elster|steuer/i, tag: 'Finanzamt' }, { re: /wise\.com|wise business/i, tag: 'Wise' }, { re: /mahnung|zahlungserinnerung|inkasso|frist|kündigung/i, tag: 'عاجل' },
];
function classify(mail) {
  const hay = `${mail.from || ''} ${mail.subject || ''}`, tags = RULES.filter(r => r.re.test(hay)).map(r => r.tag);
  const invoice = /rechnung|invoice|faktura/i.test(hay) || (!!mail.hasAttachment && /rechnung|invoice/i.test(mail.snippet || ''));
  return { important: tags.length > 0, tags, invoice };
}
function create({ dir, everyMs = 300000 } = {}) {
  return {
    name: 'mail-triage', title: 'وكيل الإيميلات والفواتير', everyMs,
    async run(ctx) {
      if (!dir || !fs.existsSync(dir)) return { summary: 'no-inbox' };
      const done = path.join(dir, 'processed'); fs.mkdirSync(done, { recursive: true });
      let n = 0, imp = 0;
      for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
        let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { continue; }
        const c = classify(m); n++;
        if (c.important) { imp++; await ctx.notify('mail-' + (m.id || f), `📧 ${c.tags.join(' · ')}${c.invoice ? ' · 🧾 فاتورة' : ''}\n${String(m.from || '').slice(0, 60)}\n${String(m.subject || '').slice(0, 120)}`, { force: true }); }
        if (!ctx.dryRun) fs.renameSync(path.join(dir, f), path.join(done, f));
      }
      return { summary: `${n} mails, ${imp} important` };
    },
  };
}
module.exports = { create, classify };
