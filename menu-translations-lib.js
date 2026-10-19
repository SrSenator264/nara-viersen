'use strict';
// menu-translations-lib.js — Übersetzungs-Entwürfe (EN/AR) fürs Menü. Aus server.js herausgelöst (testbar, Verhalten unverändert).
// Server-Modul: wird nur per require geladen, nie an Browser ausgeliefert (auth.js SERVER_FILES).
const fs=require('node:fs'),path=require('node:path');
// menu-translations.json neben server.js (fehlt/kaputt → null → kein Import)
function load(dir){try{return JSON.parse(fs.readFileSync(path.join(dir,'menu-translations.json'),'utf8'))}catch(e){return null}}
// Übersetzungs-Entwürfe (EN/AR) aus menu-translations.json: füllt NUR fehlende Sprachen, nie vorhandene Texte; Status 'draft' bis zur Freigabe.
function importMenuTranslationDrafts(data,naraMenuTr){if(!naraMenuTr)return 0;let n=0;const slot=o=>{if(!o.translations||typeof o.translations!=='object'||Array.isArray(o.translations))o.translations={};return o.translations};
 for(const p of data.products||[]){const e=naraMenuTr.products&&naraMenuTr.products[String(p.sourceId)];if(!e)continue;const t=slot(p);for(const l of['ar','en']){if(t[l]&&typeof t[l]==='object')continue;t[l]={name:e.name[l]||p.name,description:e.description[l]||p.description||'',status:'draft'};n++}}
 for(const c of data.categories||[]){const e=naraMenuTr.categories&&naraMenuTr.categories[c.name];if(!e)continue;const t=slot(c);for(const l of['ar','en']){if(t[l]&&typeof t[l]==='object')continue;t[l]={name:e[l]||c.name,status:'draft'};n++}}
 return n}
// freigegebene Übersetzungen → {ar:{n,d},en:{n,d}} (Entwürfe erscheinen nie beim Kunden/an der Kasse)
function menuTrOf(o,f){const r={};for(const l of['ar','en']){const e=o&&o.translations&&o.translations[l];if(e&&typeof e==='object'&&e.status==='approved'){const x={};for(const k of Object.keys(f))if(e[f[k]])x[k]=String(e[f[k]]);if(Object.keys(x).length)r[l]=x}}return r}
module.exports={load,importMenuTranslationDrafts,menuTrOf};
