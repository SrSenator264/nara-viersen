'use strict';
// Kasse über den Tunnel NUR für freigegebene Cloudflare-Access-Konten (z. B. nur dein Handy/Mail).
// Aktiv nur wenn NARA_KASSE_HOST gesetzt ist (z. B. kasse.flamo.co.de). Ohne Host-Eintrag passiert nichts.
// Prüft: Verbindung kommt vom eigenen Rechner (cloudflared) UND Tunnel-Header da UND Access-Mail ist erlaubt.
// So reicht es nicht, den Header aus dem WLAN zu fälschen (Loopback-Pflicht), und nicht, Cloudflare zu umgehen.
const LOOP = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const list = s => String(s || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
function kasseGate(req, env = process.env) {
  const kh = String(env.NARA_KASSE_HOST || '').trim().toLowerCase();
  if (!kh) return { gated: false };
  const host = String(req.headers.host || '').split(':')[0].trim().toLowerCase();
  if (host !== kh) return { gated: false };
  const sock = String(req.socket && req.socket.remoteAddress || '');
  const mail = String(req.headers['cf-access-authenticated-user-email'] || '').trim().toLowerCase();
  const allowed = list(env.NARA_KASSE_EMAILS);
  const ok = LOOP.has(sock) && !!req.headers['cf-connecting-ip'] && !!mail && allowed.includes(mail);
  return ok ? { gated: true, ok: true, email: mail } : { gated: true, ok: false };
}
module.exports = { kasseGate };
