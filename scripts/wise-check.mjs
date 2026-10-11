// Wise read-only connectivity test. Prints NO token. Reads WISE_API_TOKEN (and optional
// WISE_PRIVATE_KEY_FILE = path to RSA private key PEM) from .env. Run: node scripts/wise-check.mjs
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
try{for(const l of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
const T=process.env.WISE_API_TOKEN,KEYF=process.env.WISE_PRIVATE_KEY_FILE,BASE=process.env.WISE_BASE||'https://api.wise.com';
if(!T){console.log('WISE_API_TOKEN fehlt in .env');process.exit(1)}
const call=async(p,extra={})=>{const r=await fetch(BASE+p,{headers:{Authorization:'Bearer '+T,...extra}});let b=null;try{b=await r.json()}catch{}return{status:r.status,headers:r.headers,body:b}};
const out=(...a)=>console.log(...a);
const pr=await call('/v2/profiles');out('profiles:',pr.status);
if(pr.status!==200){out(JSON.stringify(pr.body).slice(0,300));process.exit(1)}
const prof=(pr.body||[]).find(p=>p.type==='business'||p.type==='BUSINESS')||pr.body[0];out('profile type:',prof.type,'id:',prof.id);
const bl=await call(`/v4/profiles/${prof.id}/balances?types=STANDARD`);out('balances:',bl.status);
const eur=(bl.body||[]).find(b=>b.currency==='EUR');if(!eur){out('kein EUR-Saldo gefunden');process.exit(1)}
out('EUR balance id:',eur.id);
const end=new Date(),start=new Date(end-7*864e5);
const q=`/v1/profiles/${prof.id}/balance-statements/${eur.id}/statement.json?currency=EUR&intervalStart=${start.toISOString()}&intervalEnd=${end.toISOString()}&type=COMPACT`;
let st=await call(q);out('statement (1st try):',st.status,'2fa-result:',st.headers.get('x-2fa-approval-result')||'-');
if(st.status===403&&st.headers.get('x-2fa-approval')){
  const ott=st.headers.get('x-2fa-approval');
  if(!KEYF){out('SCA verlangt. Setze WISE_PRIVATE_KEY_FILE (RSA-Private-Key) und lade den Public Key bei Wise hoch.');process.exit(2)}
  const sig=crypto.sign('sha256',Buffer.from(ott),fs.readFileSync(KEYF)).toString('base64');
  st=await call(q,{'x-2fa-approval':ott,'X-Signature':sig});out('statement (signed):',st.status,'2fa-result:',st.headers.get('x-2fa-approval-result')||'-');
}
if(st.status===200){const tx=st.body.transactions||[];out('Buchungen letzte 7 Tage:',tx.length);
  for(const t of tx.filter(t=>t.type==='CREDIT').slice(0,5))out(' ',t.date,t.amount&&t.amount.value,t.amount&&t.amount.currency,'ref:',t.referenceNumber,'|',(t.details&&t.details.paymentReference)||'(keine paymentReference)','|',(t.details&&t.details.senderName)||'(kein senderName)');
  out('Felder in details:',tx[0]?Object.keys(tx[0].details||{}).join(','):'-')}
else out(JSON.stringify(st.body).slice(0,400));
