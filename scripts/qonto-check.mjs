// Qonto read-only connectivity test. Prints NO secret. Reads QONTO_LOGIN + QONTO_SECRET from .env.
// Run: node scripts/qonto-check.mjs
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
try{for(const l of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
const L=process.env.QONTO_LOGIN,S=process.env.QONTO_SECRET,BASE=process.env.QONTO_BASE||'https://thirdparty.qonto.com';
if(!L||!S){console.log('QONTO_LOGIN / QONTO_SECRET fehlen in .env');process.exit(1)}
const out=(...a)=>console.log(...a);
const call=async p=>{const r=await fetch(BASE+p,{headers:{Authorization:L+':'+S}});let b=null;const t=await r.text();try{b=JSON.parse(t)}catch{b=t.slice(0,300)}return{status:r.status,body:b}};
const mask=s=>s?'…'+String(s).slice(-4):'-';
const org=await call('/v2/organization');out('organization:',org.status);
if(org.status!==200){out(JSON.stringify(org.body).slice(0,400));process.exit(1)}
const accs=(org.body.organization&&org.body.organization.bank_accounts)||[];
out('Konten:',accs.length);
for(const a of accs)out(' ',a.name,'|',a.status,'|',a.currency,'| Saldo(ct):',a.balance_cents,'| IBAN',mask(a.iban));
const acc=accs.find(a=>a.main)||accs[0];if(!acc){out('kein Konto gefunden');process.exit(1)}
const tx=await call('/v2/transactions?iban='+encodeURIComponent(acc.iban)+'&per_page=10&sort_by=settled_at:desc');
out('transactions:',tx.status);
if(tx.status!==200){out(JSON.stringify(tx.body).slice(0,400));process.exit(1)}
const list=tx.body.transactions||[];out('Buchungen (letzte bis 10):',list.length);
for(const t of list.slice(0,5))out(' ',String(t.settled_at||t.emitted_at||'').slice(0,10),t.side,t.amount,t.currency,'| label:',t.label||'-','| reference:',t.reference||'(keine reference)');
out('Felder:',list[0]?Object.keys(list[0]).join(','):'-');
