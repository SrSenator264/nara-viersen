'use strict';
// watchdog.js — prüft von außen, ob Flamo (Kasse-PC) erreichbar ist. Meldet erst nach 2 Fehlern in Folge + Entwarnung. Nur lesen.
function create({ url, fetchFn = (...a) => fetch(...a), everyMs = 120000 } = {}) {
  let fails = 0, down = false;
  return {
    name: 'watchdog', title: 'حارس المحل', everyMs,
    async run(ctx) {
      let ok = false, info = '';
      try { const r = await fetchFn(String(url).replace(/\/+$/, '') + '/api/health', { signal: AbortSignal.timeout(8000) }); ok = r.ok; info = 'HTTP ' + r.status; } catch (e) { info = String(e && e.message || e).slice(0, 80); }
      if (ok) { fails = 0; if (down) { down = false; await ctx.notify('up', '✅ Flamo رجع شغّال'); } return { summary: 'ok' }; }
      fails++;
      if (fails >= 2 && !down) { down = true; await ctx.notify('down', `🔴 Flamo ما عم يردّ (${info}). تأكد من كمبيوتر المحل والإنترنت.`, { force: true }); }
      return { summary: 'fail ' + fails };
    },
  };
}
module.exports = { create };
