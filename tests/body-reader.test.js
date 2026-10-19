'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readBody } = require('../body-reader.js');

// kleiner Server: antwortet 200 {ok,p} wenn readBody ein Objekt liefert; sonst hat readBody schon selbst geantwortet
function start(limit, calls) {
  const srv = http.createServer((req, res) => {
    readBody(req, res, limit).then(p => { if (p === undefined) { calls.undef++; return; } calls.ok.push(p); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, p })); });
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
function post(srv, chunks, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: srv.address().port, method: 'POST', path: '/', headers }, res => {
      let t = ''; res.setEncoding('utf8'); res.on('data', d => t += d); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: t }));
    });
    req.on('error', reject);
    for (const c of chunks) req.write(c);
    req.end();
  });
}
const quiet = fn => async () => { const orig = console.error; console.error = () => {}; try { await fn(); } finally { console.error = orig; } };

test('readBody: valid JSON and empty body are parsed', async () => {
  const calls = { ok: [], undef: 0 }, srv = await start(1000, calls);
  try {
    assert.deepEqual(JSON.parse((await post(srv, ['{"a":1}'])).text).p, { a: 1 });
    assert.deepEqual(JSON.parse((await post(srv, [])).text).p, {});
  } finally { srv.close(); }
});
test('readBody: body larger than the limit → 413 {error:"Payload too large."} + Connection: close, handler never sees it', quiet(async () => {
  const calls = { ok: [], undef: 0 }, srv = await start(100, calls);
  try {
    const r = await post(srv, [JSON.stringify({ x: 'a'.repeat(500) })]);
    assert.equal(r.status, 413);
    assert.deepEqual(JSON.parse(r.text), { error: 'Payload too large.' });
    assert.equal(r.headers.connection, 'close');
    assert.equal(calls.ok.length, 0);
    assert.equal(calls.undef, 1);
  } finally { srv.close(); }
}));
test('readBody: a huge declared Content-Length is rejected without waiting for the body', quiet(async () => {
  const calls = { ok: [], undef: 0 }, srv = await start(100, calls);
  try {
    const r = await post(srv, ['{'], { 'content-length': String(50 * 1024 * 1024) }).catch(e => ({ status: 'err:' + e.code }));
    assert.equal(r.status, 413);
  } finally { srv.close(); }
}));
test('readBody: corrupt JSON → 400 {error:"Bad request."} without the exception text', quiet(async () => {
  const logged = []; const orig = console.error; console.error = (...a) => logged.push(a.join(' '));
  const calls = { ok: [], undef: 0 }, srv = await start(1000, calls);
  try {
    const r = await post(srv, ['{"a": oops']);
    assert.equal(r.status, 400);
    assert.deepEqual(JSON.parse(r.text), { error: 'Bad request.' });
    assert.doesNotMatch(r.text, /JSON|token|Unexpected|position|oops/i);
    assert.match(logged.join('\n'), /ungültiges JSON/); // Details nur im Log
    assert.equal(calls.ok.length, 0);
  } finally { console.error = orig; srv.close(); }
}));
test('readBody: multi-byte characters split across chunks survive (utf8 decoding)', async () => {
  const calls = { ok: [], undef: 0 }, srv = await start(1000, calls);
  try {
    const buf = Buffer.from(JSON.stringify({ name: 'برغر لحم' }), 'utf8');
    const mid = buf.indexOf(0xD8) + 1; // mitten in ein 2-Byte-Zeichen
    const r = await post(srv, [buf.subarray(0, mid), buf.subarray(mid)]);
    assert.deepEqual(JSON.parse(r.text).p, { name: 'برغر لحم' });
  } finally { srv.close(); }
});
test('readBody: exactly at the limit is accepted, one character more is rejected', quiet(async () => {
  const calls = { ok: [], undef: 0 }, srv = await start(20, calls);
  try {
    const ok = '{"k":"' + 'a'.repeat(12) + '"}'; // 20 Zeichen
    assert.equal(ok.length, 20);
    assert.equal((await post(srv, [ok])).status, 200);
    assert.equal((await post(srv, [ok.replace('"}', 'a"}')])).status, 413);
  } finally { srv.close(); }
}));
