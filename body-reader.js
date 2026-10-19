'use strict';
// body-reader.js — JSON-Body sicher lesen (Server-Modul, auth.js SERVER_FILES).
//  • Body > limit  → HTTP 413 {error:'Payload too large.'} + Connection: close, dann Verbindung kappen; es wird nichts mehr gesammelt.
//  • kaputtes JSON → HTTP 400 {error:'Bad request.'} — die Exception-Meldung geht NUR ins Log (console.error), nie zum Client.
//  • Handler-Fehler (Logik/Validierung) sind NICHT Sache dieses Moduls: die Handler antworten selbst (z. B. 422).
// readBody(req, res, limit[, replyFn]) → Promise: das geparste JSON, oder undefined wenn schon geantwortet wurde (413/400) bzw. der Client weg ist.
// replyFn(res, status, data) = server.js reply() (gleiche Header/CORS/Logging); Standard: schlanker JSON-Writer.
function defaultReply(res, status, data) {
  const body = JSON.stringify(data);
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Connection': 'close', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, res, limit, replyFn = defaultReply) {
  return new Promise(resolve => {
    let body = '', done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const tooLarge = () => {
      if (done) return;
      done = true; // ab jetzt nichts mehr sammeln
      req.removeListener('data', onData);
      try { replyFn(res, 413, { error: 'Payload too large.' }); } catch { /* Antwort schon raus */ }
      // erst nach dem Senden der 413 die Verbindung kappen (sonst sieht der Client nur einen Reset); Sicherheits-Timer falls 'finish' nie kommt
      const kill = () => { try { req.destroy(); } catch { /* weg */ } };
      res.once('finish', kill); setTimeout(kill, 2000).unref();
      resolve(undefined);
    };
    const onData = chunk => { body += chunk; if (body.length > limit) tooLarge(); };
    const len = Number(req.headers && req.headers['content-length']);
    if (Number.isFinite(len) && len > limit * 4 + 16) { tooLarge(); return; } // klar zu groß (UTF-8 max. 4 Byte/Zeichen): gar nicht erst lesen
    req.setEncoding('utf8');
    req.on('data', onData);
    req.on('end', () => {
      if (done) return;
      let parsed;
      try { parsed = JSON.parse(body || '{}'); }
      catch (e) { console.error('[NARA][BODY] ungültiges JSON', req.method, String(req.url || '').slice(0, 80), '-', e && e.message); done = true; try { replyFn(res, 400, { error: 'Bad request.' }); } catch { /* Antwort schon raus */ } resolve(undefined); return; }
      finish(parsed);
    });
    req.on('error', () => finish(undefined));
    req.on('close', () => finish(undefined)); // Client weg, bevor das Ende kam (nach 'end' ist done schon true)
  });
}
module.exports = { readBody };
