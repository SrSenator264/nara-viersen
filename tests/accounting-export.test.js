'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const AX = require('../accounting-export.js');

const acc = (id, number) => ({ id, number, name: number });
const base = () => ({
  chartOfAccounts: [acc('a1', '1000'), acc('a2', '1200'), acc('a3', '4000'), acc('a4', '1570'), acc('a5', '5000')],
  accountingPeriods: [],
  settings: { accounting: { activeExportProfileId: 'p1', exportProfiles: [{ id: 'p1', name: 'Test', format: 'datev', skr: 'SKR03', beraterNr: '12345', mandantNr: '678', wjBeginn: '01-01', kontenlaenge: 4, accountMap: {}, buKeys: {} }] } },
  journalEntries: [
    { id: 'j1', number: 'JE-1', date: '2026-11-02', description: 'Verkauf Bar mit Gruß äöüß', status: 'POSTED', sourceRef: 'SALES:1', lines: [
      { accountId: 'a1', debitCents: 11900, creditCents: 0 }, { accountId: 'a3', debitCents: 0, creditCents: 10000 }, { accountId: 'a4', debitCents: 0, creditCents: 1900 }] },
    { id: 'j2', number: 'JE-2', date: '2026-11-03', description: 'Wareneinkauf', status: 'POSTED', lines: [
      { accountId: 'a5', debitCents: 5000, creditCents: 0 }, { accountId: 'a2', debitCents: 0, creditCents: 5000 }] },
    { id: 'j3', number: 'JE-3', date: '2026-11-04', description: 'Entwurf', status: 'DRAFT', lines: [] },
  ],
});
const run = (d, o) => AX.build(d, Object.assign({ from: '2026-11-01', to: '2026-11-30' }, o), new Date(Date.UTC(2026, 10, 30, 12, 0, 0)));
const text = r => r.buffer.toString('latin1');

test('DATEV: Kopfzeile EXTF mit 31 Feldern, Berater/Mandant, WJ-Beginn, Zeitraum', () => {
  const r = run(base()), lines = text(r).split('\r\n');
  const h = lines[0].split(';');
  assert.equal(h.length, 31);
  assert.deepEqual([h[0], h[1], h[2], h[3], h[4]], ['"EXTF"', '700', '21', '"Buchungsstapel"', '13']);
  assert.deepEqual([h[10], h[11], h[12], h[13], h[14], h[15]], ['12345', '678', '20260101', '4', '20261101', '20261130']);
  assert.equal(h[26], '"03"');
  assert.equal(r.filename, 'flamo-datev-2026-11-01-2026-11-30.csv');
});

test('Mehrzeiliger Eintrag wird aufgeteilt, Soll = Haben, Entwurf bleibt draußen', () => {
  const r = run(base());
  assert.equal(r.preview.entries, 2);
  assert.equal(r.preview.rows, 3); // 119 -> 100 + 19, plus Wareneinkauf
  assert.equal(r.preview.debitCents, 16900); assert.equal(r.preview.creditCents, 16900);
  assert.equal(r.preview.balanced, true);
  const rows = text(r).split('\r\n').slice(2).filter(Boolean);
  assert.equal(rows.length, 3);
  assert.ok(rows[0].startsWith('100,00;"S";"EUR";;;;1000;4000;;0211;"JE-1"'));
  assert.ok(rows[1].startsWith('19,00;"S";"EUR";;;;1000;1570;'));
});

test('Umlaute im Buchungstext bleiben als Windows-1252/Latin-1 erhalten, arabische Zeichen fliegen raus', () => {
  const d = base(); d.journalEntries[0].description = 'Gruß äöü ß المبيعات';
  const r = run(d);
  assert.ok(r.buffer.includes(Buffer.from([0xe4, 0xf6, 0xfc]))); // ä ö ü
  assert.ok(r.buffer.includes(Buffer.from([0xdf]))); // ß
  assert.ok(!text(r).includes('?'));
});

test('Kontenzuordnung SKR (editierbar) und BU-Schlüssel', () => {
  const d = base();
  d.settings.accounting.exportProfiles[0].accountMap = { 1000: '1600', 1200: '1800', 4000: '8300', 1570: '1776', 5000: '3400' };
  d.settings.accounting.exportProfiles[0].buKeys = { 4000: '2' };
  const r = run(d), rows = text(r).split('\r\n').slice(2).filter(Boolean);
  assert.ok(rows[0].includes(';1600;8300;"2";'));
  assert.ok(rows[1].includes(';1600;1776;'));
  assert.ok(rows[2].includes(';3400;1800;'));
  assert.ok(!r.preview.warnings.some(w => w.startsWith('UNMAPPED')));
});

test('Warnungen: Periode offen, Eintrag ohne Beleg, fehlende Berater-Nr, nicht zugeordnete Konten', () => {
  const d = base(); d.settings.accounting.exportProfiles[0].beraterNr = ''; d.settings.accounting.exportProfiles[0].accountMap = { 1000: '1600' };
  const w = run(d).preview.warnings;
  assert.ok(w.includes('PERIOD_OPEN')); assert.ok(w.includes('NO_BELEG:1')); assert.ok(w.includes('NO_BERATER'));
  assert.ok(w.some(x => x.startsWith('UNMAPPED:')));
  const d2 = base(); d2.accountingPeriods = [{ status: 'CLOSED', from: '2026-11-01', to: '2026-11-30' }];
  assert.ok(!run(d2).preview.warnings.includes('PERIOD_OPEN'));
});

test('Nicht ausgeglichener Eintrag wird als unbalanced gemeldet', () => {
  const d = base(); d.journalEntries[1].lines[1].creditCents = 4000;
  assert.equal(run(d).preview.balanced, false);
});

test('Leerer Zeitraum / ungültiger Zeitraum liefert Fehler statt kaputter Datei', () => {
  assert.equal(run(base(), { from: '2026-12-01', to: '2026-12-31' }).ok, false);
  assert.equal(run(base(), { from: '2026-12-31', to: '2026-12-01' }).ok, false);
  assert.equal(run(base(), { from: 'x', to: 'y' }).ok, false);
});

test('Lexware-Entwurf: schlichte CSV mit Entwurfs-Warnung, gleiche Zeilenzahl wie DATEV', () => {
  const r = run(base(), { format: 'lexware' }), lines = text(r).split('\r\n').filter(Boolean);
  assert.equal(lines[0], 'Datum;Belegnummer;Buchungstext;Sollkonto;Habenkonto;Betrag EUR;Steuerschluessel');
  assert.equal(lines.length - 1, run(base()).preview.rows);
  assert.ok(lines[1].startsWith('02.11.2026;"JE-1";'));
  assert.ok(r.preview.warnings.includes('LEXWARE_DRAFT'));
  assert.equal(r.filename, 'flamo-lexware-2026-11-01-2026-11-30.csv');
});

test('Wirtschaftsjahr-Beginn: Stichtag vor/nach dem Beginn', () => {
  assert.equal(AX.wjStart('01-01', '2026-11-01'), '20260101');
  assert.equal(AX.wjStart('07-01', '2026-03-15'), '20250701');
  assert.equal(AX.wjStart('0701', '2026-08-01'), '20260701');
});

test('Profile: Format wählbar pro Profil, ungültige Werte fallen auf Standard zurück', () => {
  const p = AX.normalizeProfile({ format: 'xyz', skr: 'SKR99', kontenlaenge: 99, beraterNr: 'A12' });
  assert.equal(p.format, 'datev'); assert.equal(p.skr, 'SKR03'); assert.equal(p.kontenlaenge, 8); assert.equal(p.beraterNr, '12');
  const d = base(); d.settings.accounting.exportProfiles.push({ id: 'p2', format: 'lexware' });
  assert.equal(run(d, { profileId: 'p2' }).format, 'lexware');
});
