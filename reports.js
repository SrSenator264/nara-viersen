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
w_VAT_SALES_RATE_ASSUMED:{de:'Netto-Umsatz mit {r} % USt gerechnet (Speisen). Getränke mit 19 % sind nicht getrennt.',ar:'صافي المبيعات محسوب على ضريبة {r}% (أكل). المشروبات بـ 19% مو مفصولة.',en:'Net sales computed at {r}% VAT (food). 19% drinks are not split.'},
w_MANUAL_VAT_ZERO:{de:'Manuelle Ausgaben ohne USt erfasst — Vorsteuer fehlt evtl.',ar:'المصاريف اليدوية مدخلة بضريبة 0 — ممكن يكون في Vorsteuer ضايع.',en:'Manual expenses entered with 0 VAT — input VAT may be missing.'},
vatH:{de:'Umsatzsteuer (Regelbesteuerung)',ar:'ضريبة المبيعات (Regel)',en:'VAT (standard)'},vatOut:{de:'USt auf Umsätze',ar:'ضريبة المبيعات (USt)',en:'Output VAT'},vatIn:{de:'Vorsteuer',ar:'Vorsteuer (بترجعلك)',en:'Input VAT'},vatPay:{de:'Zahllast ans Finanzamt',ar:'المستحق للـ Finanzamt',en:'Payable to tax office'},netNote:{de:'Beträge netto',ar:'المبالغ صافي',en:'net amounts'},
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
item:{de:'Posten',ar:'البند',en:'Item'},value:{de:'Wert',ar:'القيمة',en:'Value'},
manualBtn:{de:'Manuelle Ausgaben',ar:'مصاريف يدوية',en:'Manual expenses'},manualH:{de:'Manuelle Ausgaben für den Monat',ar:'مصاريف يدوية للشهر',en:'Manual expenses for the month'},
manualHint:{de:'Netto und USt je Kategorie in Euro. Leere Felder = 0. Speichern ersetzt die Werte des Monats.',ar:'الصافي والضريبة لكل فئة باليورو. الفاضي = 0. الحفظ بيستبدل قيم الشهر.',en:'Net and VAT per category in euro. Empty = 0. Saving replaces the month\'s values.'},
netCol:{de:'Netto €',ar:'الصافي €',en:'Net €'},vatCol:{de:'USt €',ar:'الضريبة €',en:'VAT €'},noteCol:{de:'Notiz',ar:'ملاحظة',en:'Note'},
save:{de:'Speichern',ar:'حفظ',en:'Save'},saved:{de:'Gespeichert',ar:'انحفظ',en:'Saved'},badAmount:{de:'Ungültiger Betrag',ar:'مبلغ مو صحيح',en:'Invalid amount'},pickMonth:{de:'Bitte zuerst einen Monat wählen.',ar:'اختار شهر أولاً.',en:'Pick a month first.'},
incManual:{de:'manuell',ar:'يدوي',en:'manual'},bankLine:{de:'Bank',ar:'بالبنك',en:'bank'},bankH:{de:'Bank (nur Info, nicht in der GuV)',ar:'البنك (للمعلومات بس، مو داخل بالربح والخسارة)',en:'Bank (info only, not in P&L)'},bk_PRIVATE:{de:'Privatentnahmen',ar:'سحوبات شخصية',en:'Private withdrawals'},bk_TRANSFER:{de:'Geldtransit',ar:'تحويل داخلي',en:'Internal transfers'},bk_PLATFORM_PAYOUT:{de:'Plattform-Auszahlungen',ar:'دفعات المنصات',en:'Platform payouts'},bankUncat:{de:'{n} Buchungen ohne Kategorie',ar:'{n} حركة بدون فئة',en:'{n} transactions without category'},incH:{de:'Plattform-Umsatz (Monat)',ar:'مبيعات المنصات (الشهر)',en:'Platform sales (month)'},incCol:{de:'Umsatz €',ar:'المبيعات €',en:'Sales €'},incHint:{de:'Leer = aus Abrechnungen. Ein Wert ersetzt die Abrechnungen für den ganzen Monat (z. B. Partner Hub).',ar:'فاضي = من الكشوف. الرقم بيحلّ محل الكشوف للشهر كلو (مثلاً من Partner Hub).',en:'Empty = from statements. A value replaces the statements for the whole month (e.g. Partner Hub).'},manualLine:{de:'davon manuell',ar:'منها يدوي',en:'of which manual'},
w_MANUAL_EXPENSES:{de:'Ausgaben manuell erfasst (ohne Einzelbelege).',ar:'المصاريف مدخلة يدوي (بدون فواتير مفصّلة).',en:'Expenses entered manually (no individual receipts).'},
w_MANUAL_EXPENSES_WITH_INVOICES:{de:'Manuelle Ausgaben und Rechnungen im selben Zeitraum: auf Doppelerfassung prüfen.',ar:'في مصاريف يدوية وفواتير بنفس الفترة: تأكد ما في شي محسوب مرتين.',en:'Manual expenses and invoices in the same period: check for double counting.'},
// einfache Ansicht: so entsteht der Gewinn (für Nicht-Buchhalter)
simpleH:{de:'So entsteht der Gewinn',ar:'كيف طلع الربح',en:'How the profit comes about'},
eqIncome:{de:'Einnahmen',ar:'المبيعات',en:'Income'},eqIncomeNet:{de:'Einnahmen (ohne MwSt)',ar:'المبيعات (بدون ضريبة)',en:'Income (excl. VAT)'},
eqIncomeX:{de:'Alles, was Kasse, Website und Plattformen verkauft haben.',ar:'كل اللي بعناه بالكاشير والموقع والمنصات.',en:'Everything sold via till, website and platforms.'},
eqIncomeVatX:{de:'Die MwSt gehört dem Finanzamt und ist hier schon herausgerechnet.',ar:'الضريبة إلها للمالية وهون مطلوعة من المبلغ.',en:'VAT belongs to the tax office and is already taken out here.'},
eqGoods:{de:'Waren & Einkauf',ar:'البضاعة والمشتريات',en:'Goods & purchases'},eqGoodsX:{de:'Genehmigte Einkaufsrechnungen (Fleisch, Brot, Verpackung …).',ar:'فواتير المشتريات المعتمدة (لحمة، خبز، تغليف…).',en:'Approved purchase invoices (meat, bread, packaging …).'},
eqStaff:{de:'Personal',ar:'الرواتب',en:'Staff'},eqStaffX:{de:'Löhne aus erfassten Lohnzahlungen und manuellen Einträgen.',ar:'الرواتب من الدفعات المسجّلة والإدخال اليدوي.',en:'Wages from recorded payments and manual entries.'},
eqOther:{de:'Sonstige Kosten',ar:'مصاريف تانية',en:'Other costs'},eqOtherX:{de:'Miete, Strom, Plattform-Gebühren, Versicherung, Bank …',ar:'إيجار، كهربا، عمولات المنصات، تأمين، بنك…',en:'Rent, energy, platform fees, insurance, bank …'},
eqAfa:{de:'Abschreibung',ar:'استهلاك الأجهزة',en:'Depreciation'},eqAfaX:{de:'Teure Geräte werden über ihre Nutzungsjahre verteilt.',ar:'الأجهزة الغالية بتنوزّع كلفتها على سنين استعمالها.',en:'Expensive equipment is spread over its useful life.'},
eqProfit:{de:'Gewinn',ar:'الربح',en:'Profit'},eqLoss:{de:'Verlust',ar:'خسارة',en:'Loss'},eqProfitX:{de:'Was übrig bleibt — vor Einkommen- und Gewerbesteuer.',ar:'اللي بيضل — قبل ضريبة الدخل والضريبة التجارية.',en:'What is left — before income and trade tax.'},
eqVat:{de:'MwSt ans Finanzamt (Zahllast)',ar:'الضريبة اللي لازم تندفع للمالية',en:'VAT to pay (net)'},eqVatX:{de:'Durchlaufend: von Kunden kassiert minus Vorsteuer aus Rechnungen. Weder Gewinn noch Verlust.',ar:'مصاري مارقة: انقبضت من الزباين ناقص الضريبة يلي دفعناها بالفواتير. مو ربح ولا خسارة.',en:'Pass-through: collected from customers minus input VAT on invoices. Neither profit nor loss.'},
eqCheck:{de:'Rechnung geht auf ✓',ar:'الحساب مظبوط ✓',en:'The maths adds up ✓'},eqCheckBad:{de:'Rechnung geht nicht auf — bitte dem Team melden',ar:'الحساب مو راكب — خبّر الفريق',en:'The maths does not add up — please report it'}
};
const CATS=['GOODS','RENT','ENERGY','TELECOM','INSURANCE','PLATFORM_FEES','WAGES','VEHICLE','MARKETING','EQUIPMENT_SMALL','BANK_FEES','OTHER','AFA'];
const PLN={LIEFERANDO:'Lieferando',UBER_EATS:'Uber Eats',WOLT:'Wolt',LANCH:'Lanch',JUST_VIRTUAL:'Just Smashed'};
const $=id=>document.getElementById(id),t=(k,v)=>FT.t(k,v);let report=null;const today=()=>window.NARA_DAY?NARA_DAY.today():new Date().toISOString().slice(0,10);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function money(c){return `${(Number(c||0)/100).toFixed(2)} €`;}
// Zeilen der GuV: Einnahmen (Kasse, je Plattform, manuell) → Ausgaben je Kategorie → Ergebnis
function lines(){if(!report)return[];const r=report,inc=r.income||{},ex=r.expenses||{},cov=r.statementCoverage||{},L=[];
  const nn=r.vat?' · '+t('netNote'):'';L.push({h:t('incomeH')+nn});if(inc.ownCents)L.push({k:t('own'),v:inc.ownCents});
  for(const [p,c] of Object.entries(inc.byPlatform||{}))if(c){const src=(inc.incomeSource||{})[p]||{};L.push({k:PLN[p]||p,v:c,sub:src.manualCents?t('incManual'):cov[p]?t('covDays',{d:cov[p].days,n:cov[p].of}):''});}
  if(inc.manualCents)L.push({k:t('manual'),v:inc.manualCents});L.push({k:t('incomeTotal'),v:inc.totalCents,b:1});
  L.push({h:t('expenseH')+nn});const me=(r.manualExpenses&&r.manualExpenses.byCat)||{};const bk=(r.bank&&r.bank.byCat)||{};for(const c of CATS)if(ex[c]||bk[c])L.push({k:t(`c_${c}`),v:ex[c]||0,sub:[me[c]?`${t('manualLine')} ${money(me[c])}`:'',bk[c]?`${t('bankLine')} ${money(bk[c])}`:''].filter(Boolean).join(' · ')});L.push({k:t('costs'),v:ex.totalCents,b:1});
  if(r.bank&&r.bank.count){L.push({h:t('bankH')});for(const c of ['PRIVATE','TRANSFER'])if(bk[c])L.push({k:t(`bk_${c}`),v:bk[c]});if(bk.PLATFORM_PAYOUT)L.push({k:t('bk_PLATFORM_PAYOUT'),v:-bk.PLATFORM_PAYOUT});if(r.bank.uncategorized)L.push({k:t('bankUncat',{n:r.bank.uncategorized}),v:0});}
  L.push({k:t('result'),v:r.profitCents,b:1,res:1});
  if(r.vat){L.push({h:t('vatH')});L.push({k:t('vatOut'),v:r.vat.outputCents});L.push({k:t('vatIn'),v:-r.vat.inputCents});L.push({k:t('vatPay'),v:r.vat.payableCents,b:1});}
  return L;}
// Einfache Gleichung: Einnahmen − Waren − Personal − Sonstiges − Abschreibung = Gewinn, mit Gegenprobe aus den Einzelposten
function simpleModel(r){const inc=r.income||{},ex=r.expenses||{};
  const channels=[['own',inc.ownCents],...Object.entries(inc.byPlatform||{}),['manual',inc.manualCents]].filter(([,c])=>Number(c));
  const other=CATS.filter(c=>!['GOODS','WAGES','AFA'].includes(c)).reduce((s,c)=>s+(Number(ex[c])||0),0);
  const goods=Number(ex.GOODS)||0,staff=Number(ex.WAGES)||0,afa=Number(ex.AFA)||0,income=Number(inc.totalCents)||0;
  const sumChannels=channels.reduce((s,[,c])=>s+Number(c),0);
  const ok=Math.abs(income-goods-staff-other-afa-(Number(r.profitCents)||0))<=1&&Math.abs(sumChannels-income)<=1&&Math.abs(goods+staff+other+afa-(Number(ex.totalCents)||0))<=1;
  return {channels,income,goods,staff,other,afa,profit:Number(r.profitCents)||0,ok};}
function simpleView(){const r=report;if(!r){$('simple').innerHTML='';return;}const m=simpleModel(r),vat=r.vat;
  const by=m.channels.map(([k,c])=>`${esc(k==='own'?t('own'):k==='manual'?t('manual'):(PLN[k]||k))} ${money(c)}`).join(' · ');
  const row=(op,label,expl,v,cls,extra)=>`<div class="eq-row ${cls||''}"><span class="op">${op}</span><div class="eq-t"><b>${esc(label)}</b><small>${esc(expl)}</small>${extra||''}</div><strong>${money(v)}</strong></div>`;
  $('simple').innerHTML=`<h2>🧮 ${esc(t('simpleH'))}</h2><div class="eq">`
    +row('+',vat?t('eqIncomeNet'):t('eqIncome'),t('eqIncomeX')+(vat?' '+t('eqIncomeVatX'):''),m.income,'plus',by?`<small class="by">${by}</small>`:'')
    +row('−',t('eqGoods'),t('eqGoodsX'),m.goods,'minus')+row('−',t('eqStaff'),t('eqStaffX'),m.staff,'minus')
    +row('−',t('eqOther'),t('eqOtherX'),m.other,'minus')+(m.afa?row('−',t('eqAfa'),t('eqAfaX'),m.afa,'minus'):'')
    +row('=',m.profit>=0?t('eqProfit'):t('eqLoss'),t('eqProfitX'),m.profit,'total '+(m.profit>=0?'pos':'neg'))
    +`<p class="eq-check ${m.ok?'ok':'bad'}">${esc(m.ok?t('eqCheck'):t('eqCheckBad'))}</p>`
    +(vat?row('ⓘ',t('eqVat'),t('eqVatX'),vat.payableCents,'vat'):'')+`</div>`;}
const warnText=w=>t(`w_${w}`,{p:(report.uncoveredPlatforms||[]).map(p=>PLN[p]||p).join(', '),r:report.vat?report.vat.salesRate:''});
function paint(){if(!report)return;const ex=report.expenses||{};$('sales').textContent=money(report.salesCents);$('purchases').textContent=money(ex.GOODS);$('labor').textContent=money(ex.WAGES);$('profit').textContent=money(report.profitCents);$('profit').style.color=report.profitCents>=0?'#18834b':'#c83b1d';
  const rows=lines().map(l=>l.h?`<div class="sec"><strong>${esc(l.h)}</strong></div>`:`<div${l.b?' class="tot"':''}><span>${esc(l.k)}${l.sub?` <small class="mute">· ${esc(l.sub)}</small>`:''}</span><strong${l.res?` style="color:${l.v>=0?'#18834b':'#c83b1d'}"`:''}>${money(l.v)}</strong></div>`).join('');
  $('details').innerHTML=`<div><span>${esc(t('period'))}</span><strong dir="ltr">${report.from} → ${report.to}</strong></div>${rows}${report.cogsCents?`<div class="info"><span>${esc(t('cogsInfo'))}</span><span>${money(report.cogsCents)}</span></div>`:''}`;
  const warn=(report.warnings||[]).map(w=>`<li>${esc(warnText(w))}</li>`).join('');
  $('warnings').innerHTML=(warn?`<h2>⚠️ ${esc(t('warnH'))}</h2><ul>${warn}</ul>`:'')+`<p class="mute">${esc(t('review'))}</p>`;
  simpleView();}
async function loadReport(){const r=await fetch(`/api/reports/profit-loss?from=${$('from').value}&to=${$('to').value}`);const j=await r.json();if(!r.ok)throw Error(j.error||t('err'));report=j.report;paint();}
function setMonth(){const m=$('month').value;if(!/^\d{4}-\d{2}$/.test(m))return;const [y,mo]=m.split('-').map(Number),last=new Date(Date.UTC(y,mo,0)).getUTCDate();$('from').value=m+'-01';$('to').value=m+'-'+String(last).padStart(2,'0');loadReport().catch(e=>$('details').textContent=e.message);}
function exportReport(){if(!report){alert(t('showFirst'));return;}const rows=[[t('item'),t('value')],[t('period'),report.from+' - '+report.to],...lines().map(l=>l.h?[l.h,'']:[l.k,(l.v/100).toFixed(2).replace('.',',')]),...(report.warnings||[]).map(w=>[t('warnH'),warnText(w)])];const csv='﻿'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(';')).join('\r\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`flamo-guv-${report.from}-${report.to}.csv`;a.click();}
// Manual monthly expenses: net + VAT per category, stored per month on the server
const MCATS=CATS.filter(c=>c!=='AFA'&&c!=='PLATFORM_FEES');let manual={},manualInc={};const MPF=['LIEFERANDO','UBER_EATS','WOLT','LANCH','JUST_VIRTUAL'];
const toCents=v=>{const s=String(v||'').trim().replace(/\s/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.');if(!s)return 0;const n=Number(s);return Number.isFinite(n)&&n>=0?Math.round(n*100):NaN;};
const eurIn=c=>c?(c/100).toFixed(2).replace('.',','):'';
function drawManual(){$('manualRows').innerHTML=`<div class="mh"><strong>${esc(t('incH'))}</strong><span>${esc(t('incCol'))}</span><span></span><span class="mute">${esc(t('incHint'))}</span></div>`+MPF.map(p=>`<div data-p="${p}"><span>${esc(PLN[p]||p)}</span><input inputmode="decimal" class="i" value="${eurIn(manualInc[p])}"><span></span><span></span></div>`).join('')+`<div class="mh"><strong>${esc(t('expenseH'))}</strong></div><div class="mh"><span></span><span>${esc(t('netCol'))}</span><span>${esc(t('vatCol'))}</span><span>${esc(t('noteCol'))}</span></div>`+MCATS.map(c=>{const v=manual[c]||{};return `<div data-c="${c}"><span>${esc(t(`c_${c}`))}</span><input inputmode="decimal" class="n" value="${eurIn(v.netCents)}"><input inputmode="decimal" class="v" value="${eurIn(v.vatCents)}"><input class="note" maxlength="200" value="${esc(v.note||'')}"></div>`;}).join('');}
async function toggleManual(){const p=$('manualPanel');if(!p.hidden){p.hidden=true;return;}const m=$('month').value;if(!/^\d{4}-\d{2}$/.test(m)){alert(t('pickMonth'));return;}const r=await fetch(`/api/accounting/manual-expenses?month=${m}`),j=await r.json();manual=j.entries||{};manualInc=j.income||{};drawManual();$('manualStatus').textContent='';p.hidden=false;}
async function saveManual(){const m=$('month').value,entries={};if(!/^\d{4}-\d{2}$/.test(m)){alert(t('pickMonth'));return;}
  for(const row of document.querySelectorAll('#manualRows [data-c]')){const n=toCents(row.querySelector('.n').value),v=toCents(row.querySelector('.v').value);if(Number.isNaN(n)||Number.isNaN(v)){$('manualStatus').textContent=`${t('badAmount')}: ${t(`c_${row.dataset.c}`)}`;return;}if(n||v)entries[row.dataset.c]={netCents:n,vatCents:v,note:row.querySelector('.note').value};}
  const income={};for(const row of document.querySelectorAll('#manualRows [data-p]')){const c=toCents(row.querySelector('.i').value);if(Number.isNaN(c)){$('manualStatus').textContent=`${t('badAmount')}: ${PLN[row.dataset.p]||row.dataset.p}`;return;}if(c)income[row.dataset.p]=c;}
  const r=await fetch('/api/accounting/manual-expenses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:m,entries,income})}),j=await r.json();if(!r.ok){$('manualStatus').textContent=j.error||t('err');return;}manual=j.entries;manualInc=j.income||{};drawManual();$('manualStatus').textContent='✓ '+t('saved');setMonth();}
FT.init(T,{onChange:()=>{paint();if(!$('manualPanel').hidden)drawManual();}});{const d=today(),y=Number(d.slice(0,4)),m=Number(d.slice(5,7)),pm=m===1?(y-1)+'-12':y+'-'+String(m-1).padStart(2,'0');$('month').value=pm;$('month').onchange=()=>{setMonth();if(!$('manualPanel').hidden){$('manualPanel').hidden=true;toggleManual();}};setMonth();}
