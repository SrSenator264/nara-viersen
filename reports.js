const T={
eyebrow:{de:'Buchhaltung und Analyse',ar:'المحاسبة والتحليل',en:'Accounting & analysis'},
h1:{de:'Gewinn- und Verlustrechnung',ar:'تقرير الربح والخسارة',en:'Profit & loss report'},
sub:{de:'Einnahmen, Ausgaben und Ergebnis pro Monat oder Zeitraum, nach derselben Logik wie die EÜR.',ar:'الإيرادات والمصاريف والنتيجة لكل شهر أو فترة، بنفس حساب الـEÜR.',en:'Income, expenses and result per month or period, using the same logic as the EÜR.'},
title:{de:'GuV',ar:'الربح والخسارة',en:'Profit & loss'},
month:{de:'Monat',ar:'الشهر',en:'Month'},
from:{de:'Von',ar:'من',en:'From'},to:{de:'Bis',ar:'إلى',en:'To'},show:{de:'Bericht anzeigen',ar:'عرض التقرير',en:'Show report'},print:{de:'Drucken / PDF',ar:'طباعة / PDF',en:'Print / PDF'},export:{de:'Excel-Export',ar:'تصدير Excel',en:'Export to Excel'},
sales:{de:'Einnahmen',ar:'الإيرادات',en:'Income'},purch:{de:'Waren',ar:'البضاعة',en:'Goods'},labor:{de:'Personalkosten',ar:'الرواتب',en:'Labour cost'},net:{de:'Gewinn / Verlust',ar:'صافي الربح / الخسارة',en:'Net profit / loss'},
details:{de:'Details des Zeitraums',ar:'تفاصيل الفترة',en:'Period details'},loading:{de:'Wird geladen…',ar:'عم يحمّل…',en:'Loading…'},period:{de:'Zeitraum',ar:'الفترة',en:'Period'},
incomeH:{de:'Einnahmen',ar:'الإيرادات',en:'Income'},expenseH:{de:'Ausgaben',ar:'المصاريف',en:'Expenses'},
own:{de:'Kasse / Website',ar:'المحل (كاشير / موقع)',en:'Till / website'},manual:{de:'Manuell (Jahr)',ar:'يدوي (سنوي)',en:'Manual (year)'},
incomeTotal:{de:'Einnahmen gesamt',ar:'مجموع الإيرادات',en:'Total income'},costs:{de:'Ausgaben gesamt',ar:'مجموع المصاريف',en:'Total expenses'},result:{de:'Ergebnis',ar:'النتيجة',en:'Result'},
c_GOODS:{de:'Waren',ar:'بضاعة',en:'Goods'},c_RENT:{de:'Miete',ar:'إيجار',en:'Rent'},c_ENERGY:{de:'Energie',ar:'كهربا وغاز ومي',en:'Energy'},c_TELECOM:{de:'Telefon / Internet',ar:'تلفون وإنترنت',en:'Phone / internet'},
c_INSURANCE:{de:'Versicherung / Beiträge',ar:'تأمين واشتراكات',en:'Insurance / fees'},c_PLATFORM_FEES:{de:'Plattform-Gebühren',ar:'عمولات المنصات',en:'Platform fees'},c_WAGES:{de:'Löhne',ar:'رواتب',en:'Wages'},
c_VEHICLE:{de:'Fahrzeug',ar:'سيارة',en:'Vehicle'},c_MARKETING:{de:'Werbung',ar:'تسويق',en:'Marketing'},c_EQUIPMENT_SMALL:{de:'Kleingeräte',ar:'معدات صغيرة',en:'Small equipment'},
c_BANK_FEES:{de:'Bank / Zahlung',ar:'بنك ودفع',en:'Bank / payment'},c_OTHER:{de:'Sonstiges',ar:'متفرقات',en:'Other'},c_AFA:{de:'Abschreibung (AfA)',ar:'إهلاك (AfA)',en:'Depreciation'},
cogsInfo:{de:'Wareneinsatz laut Lager (nur Info)',ar:'تكلفة المواد حسب المخزون (معلومة بس)',en:'Cost of goods from stock (info only)'},
warnH:{de:'Hinweise',ar:'تنبيهات',en:'Notes'},
w_REGEL_NET_SPLIT_NEEDED:{de:'Regelbesteuerung: Netto/USt noch nicht getrennt, Beträge sind brutto.',ar:'ضريبة عادية: لسا ما في فصل صافي/ضريبة، المبالغ غروس.',en:'Standard VAT: net/VAT not split yet, amounts are gross.'},
w_NO_PURCHASE_INVOICES:{de:'Keine Einkaufsrechnungen im Zeitraum: Ausgaben sind zu niedrig.',ar:'ما في فواتير شراء بهالفترة: المصاريف أقل من الحقيقة.',en:'No purchase invoices in this period: expenses are too low.'},
w_NO_PLATFORM_FEES:{de:'Plattform-Umsatz ohne Plattform-Abrechnung: Gebühren fehlen.',ar:'في مبيعات منصات بدون كشوف: العمولات ناقصة.',en:'Platform sales without statements: fees are missing.'},
w_PLATFORM_STATEMENT_GAPS:{de:'Plattform-Abrechnungen decken nicht alle Tage ab: {p}.',ar:'كشوف المنصات ما بتغطي كل الأيام: {p}.',en:'Platform statements do not cover every day: {p}.'},
w_NO_PAYROLL:{de:'Keine Lohnzahlungen im Zeitraum.',ar:'ما في رواتب مدفوعة بهالفترة.',en:'No wage payments in this period.'},
w_CATEGORIES_GUESSED:{de:'Kategorien teils geschätzt (Lieferantenname).',ar:'بعض الفئات مخمّنة من اسم المورّد.',en:'Some categories guessed from supplier name.'},
w_NO_RENT:{de:'Keine Miete erfasst.',ar:'ما في إيجار مسجّل.',en:'No rent recorded.'},
w_MANUAL_REVENUE_YEARLY_ONLY:{de:'Manueller Jahresumsatz zählt nur bei ganzem Jahr.',ar:'المبيعات اليدوية السنوية بتنحسب بس لسنة كاملة.',en:'Manual yearly revenue counts only for a full year.'},
covDays:{de:'{d} von {n} Tagen',ar:'{d} من {n} يوم',en:'{d} of {n} days'},
review:{de:'Entwurf zur Prüfung, keine Steuererklärung.',ar:'مسودة للمراجعة، مو إقرار ضريبي.',en:'Draft for review, not a tax return.'},
err:{de:'Bericht konnte nicht geladen werden',ar:'تعذر تحميل التقرير',en:'Could not load the report'},showFirst:{de:'Bitte zuerst den Bericht anzeigen.',ar:'اعرض التقرير أولاً.',en:'Show the report first.'},
item:{de:'Posten',ar:'البند',en:'Item'},value:{de:'Wert',ar:'القيمة',en:'Value'}
};
const CATS=['GOODS','RENT','ENERGY','TELECOM','INSURANCE','PLATFORM_FEES','WAGES','VEHICLE','MARKETING','EQUIPMENT_SMALL','BANK_FEES','OTHER','AFA'];
const PLN={LIEFERANDO:'Lieferando',UBER_EATS:'Uber Eats',WOLT:'Wolt',LANCH:'Lanch'};
const $=id=>document.getElementById(id),t=(k,v)=>FT.t(k,v);let report=null;const today=()=>window.NARA_DAY?NARA_DAY.today():new Date().toISOString().slice(0,10);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function money(c){return `${(Number(c||0)/100).toFixed(2)} €`;}
// Zeilen der GuV: Einnahmen (Kasse, je Plattform, manuell) → Ausgaben je Kategorie → Ergebnis
function lines(){if(!report)return[];const r=report,inc=r.income||{},ex=r.expenses||{},cov=r.statementCoverage||{},L=[];
  L.push({h:t('incomeH')});if(inc.ownCents)L.push({k:t('own'),v:inc.ownCents});
  for(const [p,c] of Object.entries(inc.byPlatform||{}))if(c)L.push({k:PLN[p]||p,v:c,sub:cov[p]?t('covDays',{d:cov[p].days,n:cov[p].of}):''});
  if(inc.manualCents)L.push({k:t('manual'),v:inc.manualCents});L.push({k:t('incomeTotal'),v:inc.totalCents,b:1});
  L.push({h:t('expenseH')});for(const c of CATS)if(ex[c])L.push({k:t(`c_${c}`),v:ex[c]});L.push({k:t('costs'),v:ex.totalCents,b:1});
  L.push({k:t('result'),v:r.profitCents,b:1,res:1});return L;}
const warnText=w=>t(`w_${w}`,{p:(report.uncoveredPlatforms||[]).map(p=>PLN[p]||p).join(', ')});
function paint(){if(!report)return;const ex=report.expenses||{};$('sales').textContent=money(report.salesCents);$('purchases').textContent=money(ex.GOODS);$('labor').textContent=money(ex.WAGES);$('profit').textContent=money(report.profitCents);$('profit').style.color=report.profitCents>=0?'#18834b':'#c83b1d';
  const rows=lines().map(l=>l.h?`<div class="sec"><strong>${esc(l.h)}</strong></div>`:`<div${l.b?' class="tot"':''}><span>${esc(l.k)}${l.sub?` <small class="mute">· ${esc(l.sub)}</small>`:''}</span><strong${l.res?` style="color:${l.v>=0?'#18834b':'#c83b1d'}"`:''}>${money(l.v)}</strong></div>`).join('');
  $('details').innerHTML=`<div><span>${esc(t('period'))}</span><strong dir="ltr">${report.from} → ${report.to}</strong></div>${rows}${report.cogsCents?`<div class="info"><span>${esc(t('cogsInfo'))}</span><span>${money(report.cogsCents)}</span></div>`:''}`;
  const warn=(report.warnings||[]).map(w=>`<li>${esc(warnText(w))}</li>`).join('');
  $('warnings').innerHTML=(warn?`<h2>⚠️ ${esc(t('warnH'))}</h2><ul>${warn}</ul>`:'')+`<p class="mute">${esc(t('review'))}</p>`;}
async function loadReport(){const r=await fetch(`/api/reports/profit-loss?from=${$('from').value}&to=${$('to').value}`);const j=await r.json();if(!r.ok)throw Error(j.error||t('err'));report=j.report;paint();}
function setMonth(){const m=$('month').value;if(!/^\d{4}-\d{2}$/.test(m))return;const [y,mo]=m.split('-').map(Number),last=new Date(Date.UTC(y,mo,0)).getUTCDate();$('from').value=m+'-01';$('to').value=m+'-'+String(last).padStart(2,'0');loadReport().catch(e=>$('details').textContent=e.message);}
function exportReport(){if(!report){alert(t('showFirst'));return;}const rows=[[t('item'),t('value')],[t('period'),report.from+' - '+report.to],...lines().map(l=>l.h?[l.h,'']:[l.k,(l.v/100).toFixed(2).replace('.',',')]),...(report.warnings||[]).map(w=>[t('warnH'),warnText(w)])];const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\r\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`flamo-guv-${report.from}-${report.to}.csv`;a.click();}
FT.init(T,{onChange:paint});{const d=today(),y=Number(d.slice(0,4)),m=Number(d.slice(5,7)),pm=m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0');$('month').value=pm;$('month').onchange=setMonth;setMonth();}
