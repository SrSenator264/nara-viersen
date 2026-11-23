'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const PL = require('../programming-log.js');
const AHIST = require('../admin-history.js');

const mk = () => PL.open(fs.mkdtempSync(path.join(os.tmpdir(), 'plog-')));
const at = s => new Date(s);

test('Preisänderung: Zeit, Benutzer, Feld, vorher/nachher; unveränderte Speicherung schreibt nichts', () => {
  const L = mk(), old = [{ id: 'p1', name: 'Burger', priceCents: 1000, vatRate: 7 }], neu = [{ id: 'p1', name: 'Burger', priceCents: 1100, vatRate: 7 }];
  assert.equal(L.record(PL.menuEntries('products', AHIST.diff('products', old, old), 'Omar')), 0);
  assert.equal(L.record(PL.menuEntries('products', AHIST.diff('products', old, neu), 'Omar'), at('2026-11-23T10:00:00Z')), 1);
  const e = L.read()[0];
  assert.deepEqual([e.user, e.area, e.entity, e.field, e.before, e.after], ['Omar', 'MENU', 'products:p1 Burger', 'priceCents', 1000, 1100]);
  assert.equal(e.at, '2026-11-23T10:00:00.000Z');
});

test('Steuersatz-Einstellung: mehrere Felder auf einmal, verschachtelte Felder', () => {
  const L = mk();
  const n = L.recordDiff({ user: 'Omar', area: 'ACCOUNTING_SETTINGS', entity: 'settings.accounting', before: { vatRegime: 'KLEIN', platformFees: { LIEFERANDO: 10 }, same: 1 }, after: { vatRegime: 'REGEL', platformFees: { LIEFERANDO: 12 }, same: 1 } });
  assert.equal(n, 2);
  assert.deepEqual(L.read().map(e => [e.field, e.before, e.after]).sort(), [['platformFees.LIEFERANDO', 10, 12], ['vatRegime', 'KLEIN', 'REGEL']]);
});

test('Geheimnisse (PIN, Passwort, Token, Schlüssel) werden nie im Klartext protokolliert', () => {
  const L = mk();
  L.record([{ area: 'USERS', entity: 'a', field: 'pin', before: '123456', after: '654321' }, { area: 'X', entity: 'b', field: '(angelegt)', after: { name: 'Ali', pinHash: { salt: 's', hash: 'h' }, qrToken: 'abc', apiKey: 'k', priceCents: 5 } }]);
  const txt = fs.readFileSync(path.join(L.dir, fs.readdirSync(L.dir)[0]), 'utf8');
  for (const s of ['123456', '654321', '"abc"', '"k"', '"salt"', '"h"']) assert.ok(!txt.includes(s), s);
  const e = L.read(); assert.equal(e[0].after, '***'); assert.equal(e[1].after.priceCents, 5); assert.equal(e[1].after.qrToken, '***');
});

test('Hash-Kette: verify ok; Änderung, Löschen und Einfügen werden erkannt; neuer Monat setzt die Kette fort', () => {
  const L = mk();
  L.record({ user: 'a', area: 'MENU', entity: 'x', field: 'f', before: 1, after: 2 }, at('2026-10-31T10:00:00Z'));
  L.record([{ user: 'a', area: 'MENU', entity: 'x', field: 'f', before: 2, after: 3 }, { user: 'a', area: 'MENU', entity: 'x', field: 'f', before: 3, after: 4 }], at('2026-11-01T10:00:00Z'));
  assert.deepEqual(fs.readdirSync(L.dir).sort(), ['programming-log-2026-10.jsonl', 'programming-log-2026-11.jsonl']);
  assert.equal(L.verify().ok, true); assert.equal(L.verify().lines, 3);
  assert.equal(PL.open(L.dir).record({ user: 'a', area: 'MENU', entity: 'x', field: 'f', before: 4, after: 5 }, at('2026-11-02T10:00:00Z')), 1); // neue Instanz: Kette läuft weiter
  assert.equal(L.verify().ok, true);
  const f = path.join(L.dir, 'programming-log-2026-11.jsonl'), orig = fs.readFileSync(f, 'utf8');
  fs.writeFileSync(f, orig.replace('"after":3', '"after":99')); assert.equal(L.verify().ok, false);
  fs.writeFileSync(f, orig.split('\n').slice(1).join('\n')); assert.equal(L.verify().ok, false); // erste Zeile gelöscht
  fs.writeFileSync(f, orig); assert.equal(L.verify().ok, true);
});

test('Zeitraum-Filter und CSV', () => {
  const L = mk();
  L.record({ user: 'a;b', area: 'MENU', entity: 'x', field: 'f', before: 'a"b', after: 2 }, at('2026-11-02T10:00:00Z'));
  L.record({ user: 'a', area: 'MENU', entity: 'x', field: 'g', before: 1, after: 2 }, at('2026-11-20T10:00:00Z'));
  assert.equal(L.read({ from: '2026-11-10', to: '2026-11-30' }).length, 1);
  const c = L.csv(L.read()); assert.match(c, /^﻿Zeit;Benutzer;/); assert.match(c, /"a;b"/); assert.match(c, /"a""b"/);
});

test('Fehlender Benutzer = SYSTEM; lange Werte werden gekürzt', () => {
  const L = mk(); L.record({ area: 'MENU', entity: 'x', field: 'f', before: null, after: 'y'.repeat(2000) });
  const e = L.read()[0]; assert.equal(e.user, 'SYSTEM'); assert.ok(e.after.length < 600);
});

test('Es gibt keine API zum Ändern oder Löschen', () => {
  const L = mk(); assert.deepEqual(Object.keys(L).sort(), ['csv', 'dir', 'read', 'record', 'recordDiff', 'verify']);
});
