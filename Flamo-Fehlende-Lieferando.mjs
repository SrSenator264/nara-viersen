// Einmaliges Nachtragen von 6 Lieferando-Bestellungen (Dienstag 20.10.2026), die NARA nicht erreicht haben.
// Quelle: Partner Hub (Details von Omar abgetippt). Aufruf: Flamo-Fehlende-Lieferando.cmd
// Sicher: macht erst ein Backup, ueberspringt vorhandene Bestellungen (nach Code), fragt vor dem Import.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = {};
try {
  for (const line of fs.readFileSync(path.join(here, '.env'), 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch { /* ohne .env: Standardwerte */ }
const BASE = `http://127.0.0.1:${env.PORT || 4185}`;
const HEADERS = { 'content-type': 'application/json', ...(env.NARA_SERVICE_KEY ? { 'x-nara-service-key': env.NARA_SERVICE_KEY } : {}) };
const PHONE = '+4915735984469'; // Lieferando-Vermittlungsnummer, wie bei allen anderen Bestellungen

const at = s => new Date(s).toISOString();
const item = (name, category, quantity, totalCents, options = [], note = '') => ({
  id: '', name, category, quantity, unitCents: Math.round(totalCents / quantity), totalCents,
  notes: note, note, options: options.map(([n, c]) => ({ name: n, quantity: 1, totalCents: c })),
});

// code, Zeit (Partner Hub "Order accepted at"), Kunde, Adresse, Artikel, Lieferkosten (Cent)
const RAW = [
  { code: 'C4QY4X', placed: '2026-10-20T18:07:00+02:00', name: 'Berkin Bakir', verify: '938459402',
    street: 'Kanalstraße', no: '116', zip: '41748', deliveryCents: 0,
    cart: [item('Half & Half Bucket', 'Chicken Buckets & Deals (New)', 1, 2499)], totalCents: 2499 },
  { code: 'FD7HTK', placed: '2026-10-20T18:21:00+02:00', name: 'Dawid Jamróz', verify: '670534344',
    street: 'Neustraße', no: '3', zip: '41749', deliveryCents: 200, notes: 'seite eingang',
    cart: [item('Joppie Chicken Taco', 'French Tacos', 1, 899), item('Iu Gene Taco', 'French Tacos', 1, 1499), item('Kindermenü', 'Kindergerichte', 1, 749)], totalCents: 3347 },
  { code: 'RTQX6Q', placed: '2026-10-20T18:42:00+02:00', name: 'Elia Kreis', verify: '716500182',
    street: 'Am Alten Nordkanal', no: '24', zip: '41748', deliveryCents: 0,
    cart: [
      item('Falafel Taco', 'French Tacos', 1, 849),
      item('BBQ Taco', 'French Tacos', 1, 849, [], 'Ohne champignons, ohne zwiebeln'),
      item('Coleslaw Salat', 'Salate', 1, 599),
      item('Shawarma Rolle im Tortilla brot', 'Sandwiches', 1, 599),
      item('Mega Crispy Chicken Zinger-scharf (Menü)', 'Burger-Menü', 1, 1499, [['Fanta Lemon & Elderflower 0,33l', 25], ['mit Ketchup', 0]]),
      item('Crispy Chicken Filet (4 Stück)', 'Fried Chicken Gerichte', 1, 749),
      item('Chilli-Cheese Fries (scharf)', 'Specials', 1, 699),
    ], totalCents: 5868 },
  { code: '6DBCXX', placed: '2026-10-20T19:01:00+02:00', name: 'Jeannette Spornberger', verify: '681140179',
    street: 'Wilhelmstraße', no: '67', zip: '41747', deliveryCents: 0,
    cart: [item('Joppie Chicken Taco', 'French Tacos', 1, 899), item('Big Beef Burger', 'Burger', 1, 1299), item('Chill Cheese Beef Burger', 'Burger', 2, 1798)], totalCents: 3996 },
  { code: 'WY4CTG', placed: '2026-10-20T23:57:00+02:00', name: 'Aleksandr Voskobojnikov', verify: '554474477',
    street: 'Josefstraße', no: '8', zip: '41063', city: 'Mönchengladbach', floor: 'Erdgeschoß', deliveryCents: 400,
    cart: [
      item('3 für 2 Angebot - Cheese Chicken Burger', 'Angebot 3 für 2', 1, 1599),
      item("(Extra) Joppie Chick'n Taco", 'French Tacos', 1, 1499),
      item('Strawberry cream Frappe 0,5l', 'Frappuccino Series', 1, 649, [['mit Sahne', 0], ['mit Milch, fettarm', 0]]),
    ], totalCents: 4147 },
  { code: 'PT6B8Q', placed: '2026-10-21T00:07:00+02:00', name: 'Fabian Tohang', verify: '543352423',
    street: 'Eintrachtstraße', no: '20C', zip: '41751', deliveryCents: 300, notes: 'Klingel defekt bitte vorher Anrufen!! 2. Stock',
    cart: [item('Shawarma tacos Hänchenfleisch', 'French Tacos', 1, 999), item('Beef Loaded Fries', 'Specials', 1, 899), item('Hähnchen Crispy filet Sandwich', 'Sandwiches', 1, 999)], totalCents: 3197 },
];

function build(r) {
  const subtotalCents = r.cart.reduce((s, p) => s + p.totalCents, 0);
  const optionsCents = r.cart.reduce((s, p) => s + p.options.reduce((a, o) => a + o.totalCents, 0), 0);
  if (subtotalCents + optionsCents + r.deliveryCents !== r.totalCents)
    throw new Error(`${r.code}: Summe stimmt nicht (${subtotalCents}+${optionsCents}+${r.deliveryCents} != ${r.totalCents})`);
  const placedAt = at(r.placed);
  const city = r.city || 'Viersen', address = `${r.street} ${r.no}`;
  return {
    externalOrderCode: `HUB-${r.code}`, displayCode: r.code, platform: 'LIEFERANDO', ingestMethod: 'MANUAL_BACKFILL',
    liveStage: 'DONE', status: 'DONE', platformStatus: 'delivered', orderType: 'DELIVERY', type: 'delivery',
    customerName: r.name, customerPhone: PHONE, verificationCode: r.verify,
    delivery: { address, street: r.street, houseNumber: r.no, house: r.no, postalCode: r.zip, postal: r.zip, city, floor: r.floor || '', notes: r.notes || '', lat: null, lng: null, name: r.name, phone: PHONE },
    payment: { method: 'ONLINE', paid: true, raw: 'online' }, paymentMethod: 'ONLINE', externalPaymentStatus: 'PAID_ON_PLATFORM',
    externalTotalCents: r.totalCents, acceptedAt: placedAt, cashDueCents: 0,
    cart: r.cart, subtotalCents: subtotalCents + optionsCents, fees: { delivery: r.deliveryCents, service: 0, small: 0 }, discountsCents: 0, stampCents: 0, totalCents: r.totalCents,
    asap: true, placedAt, confirmedAt: placedAt, requestedAt: null, etaAt: null, dueAt: null, prepMinutes: null, driveMinutes: null, kitchenStartAt: placedAt,
    readyForKitchen: null, withAlcohol: false, remarks: r.notes || '', courierName: '',
    platformPickupAt: null, platformDeliveredAt: null, parseStatus: 'OK', warnings: [], createdAt: placedAt, sourceUpdatedAt: placedAt,
    rawText: JSON.stringify({ version: 'manual-backfill', externalOrderCode: `HUB-${r.code}`, stage: 'DONE', cart: r.cart, totalCents: r.totalCents }),
  };
}

const eur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const ask = q => new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim().toLowerCase()); }); });

async function main() {
  const orders = RAW.map(build);
  console.log(`\nServer: ${BASE}`);
  let data;
  try {
    const r = await fetch(`${BASE}/api/admin-data`, { headers: HEADERS });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    data = JSON.parse(text);
    fs.mkdirSync(path.join(here, 'backups'), { recursive: true });
    const bak = path.join(here, 'backups', `vor-fehlende-lieferando-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(bak, text);
    console.log(`Backup gespeichert: ${bak}`);
  } catch (e) {
    console.error(`FEHLER: Daten konnten nicht gelesen werden (${e.message}). Es wurde NICHTS geaendert. Laeuft der Server (NARA-Start)?`);
    process.exit(1);
  }
  const have = new Set((data.orders || []).filter(o => String(o.source || o.platform || '').toUpperCase() === 'LIEFERANDO').map(o => String(o.displayCode || '').toUpperCase()));
  const todo = orders.filter(o => !have.has(o.displayCode));
  for (const o of orders) console.log(`${have.has(o.displayCode) ? '  vorhanden  ' : '  FEHLT      '} #${o.displayCode}  ${new Date(o.placedAt).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })}  ${o.customerName}  ${eur(o.totalCents)}`);
  if (!todo.length) { console.log('\nAlles schon da. Nichts zu tun.'); return; }
  const sum = todo.reduce((s, o) => s + o.totalCents, 0);
  const a = await ask(`\n${todo.length} Bestellungen nachtragen (zusammen ${eur(sum)})? j/n: `);
  if (a !== 'j' && a !== 'ja') { console.log('Abgebrochen, nichts geaendert.'); return; }
  for (const o of todo) {
    const r = await fetch(`${BASE}/api/platform-orders/import`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ source: 'LIEFERANDO', order: o }) });
    console.log(`#${o.displayCode}: ${r.status === 201 ? 'OK' : 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120)}`);
  }
  console.log('\nFertig. Kasse neu laden (F5) und Lieferando-Zahl pruefen.');
}
main().catch(e => { console.error('FEHLER:', e.message); process.exit(1); });
