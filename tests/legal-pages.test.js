'use strict';
// Impressum/Datenschutz: 3 Sprachen, bekannte Pflichtangaben, Footer-Links auf der Kundenseite, Meta/OG, lazy Bilder.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const wp = path.join(__dirname, '..', 'web-prototype');
const rd = f => fs.readFileSync(path.join(wp, f), 'utf8');

for (const f of ['impressum.html', 'datenschutz.html']) {
  test(`${f}: DE/EN/AR vorhanden, Betreiber, Adresse, Telefon, fehlende Angaben markiert`, () => {
    const h = rd(f);
    for (const l of ['de', 'en', 'ar']) assert.ok(h.includes(`l-${l}"`), 'Sprache ' + l);
    assert.ok(h.includes('Omar Alkadri') && h.includes('Gereonstraße 1') && h.includes('41747 Viersen') && h.includes('+49 2162 5013538'));
    assert.ok((h.match(/class="warn"/g) || []).length >= 3, 'E-Mail fehlt → ⚠️ in allen 3 Sprachen');
    assert.match(h, /<meta name="description"/); assert.match(h, /property="og:title"/);
    assert.ok(h.includes('impressum.html') && h.includes('datenschutz.html') && h.includes('href="c.html"'), 'Footer + Zurück-Link');
    assert.ok(!/ANTHROPIC_API_KEY|sk-[A-Za-z0-9]{10}/.test(h), 'keine Geheimnisse');
  });
}
test('Impressum: Kleinunternehmer § 19 UStG, keine USt-IdNr.', () => {
  const h = rd('impressum.html'); assert.ok(h.includes('§ 19 UStG')); assert.ok(/USt-IdNr|Umsatzsteuer-Identifikationsnummer/.test(h));
});
test('Datenschutz: Bestelldaten, Cloudflare, KI-Chat, Google Fonts, Rechte, Aufsichtsbehörde', () => {
  const h = rd('datenschutz.html');
  for (const k of ['Cloudflare', 'Google Fonts', 'KI-Chat', 'Art. 15', 'Art. 21', 'Kavalleriestraße', 'Name, Telefonnummer']) assert.ok(h.includes(k), k);
});
test('Kundenseite: Footer-Links in 3 Sprachen, Titel/Beschreibung/OG, lazy-Bilder', () => {
  const h = rd('c.html');
  assert.ok(h.includes('href="impressum.html"') && h.includes('href="datenschutz.html"'));
  for (const l of [/de:\{[^]*?imp:'Impressum',priv:'Datenschutz'/, /en:\{[^]*?imp:'Legal notice',priv:'Privacy'/, /ar:\{[^]*?imp:'Impressum',priv:'الخصوصية'/]) assert.match(h, l);
  assert.match(h, /<title>Flamo Viersen/); assert.match(h, /<meta name="description" content="Flamo in Viersen/); assert.match(h, /property="og:title"/); assert.match(h, /property="og:image"/);
  assert.ok((h.match(/loading="lazy"/g) || []).length >= 6);
});
