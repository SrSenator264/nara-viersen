const T={
eyebrow:{de:'Buchhaltung und Analyse',ar:'المحاسبة والتحليل',en:'Accounting & analysis'},
h1:{de:'Gewinn- und Verlustrechnung',ar:'تقرير الربح والخسارة',en:'Profit & loss report'},
sub:{de:'Übersicht über Umsatz, Kosten und Ergebnis im gewählten Zeitraum.',ar:'ملخص واضح للمبيعات والتكاليف وصافي النتيجة حسب الفترة.',en:'A clear summary of sales, costs and net result for the period.'},
title:{de:'GuV',ar:'الربح والخسارة',en:'Profit & loss'},
from:{de:'Von',ar:'من',en:'From'},to:{de:'Bis',ar:'إلى',en:'To'},show:{de:'Bericht anzeigen',ar:'عرض التقرير',en:'Show report'},print:{de:'Drucken / PDF',ar:'طباعة / PDF',en:'Print / PDF'},export:{de:'Excel-Export',ar:'تصدير Excel',en:'Export to Excel'},
sales:{de:'Umsatz',ar:'المبيعات',en:'Sales'},purch:{de:'Wareneinsatz',ar:'تكلفة المواد',en:'Cost of goods'},labor:{de:'Personalkosten',ar:'مصروف العمال',en:'Labour cost'},net:{de:'Gewinn / Verlust',ar:'صافي الربح / الخسارة',en:'Net profit / loss'},
details:{de:'Details des Zeitraums',ar:'تفاصيل الفترة',en:'Period details'},loading:{de:'Wird geladen…',ar:'عم يحمّل…',en:'Loading…'},period:{de:'Zeitraum',ar:'الفترة',en:'Period'},
operating:{de:'Betriebskosten',ar:'المصاريف التشغيلية',en:'Operating expenses'},costs:{de:'Gesamtkosten',ar:'إجمالي التكاليف',en:'Total costs'},result:{de:'Nettoergebnis',ar:'صافي النتيجة',en:'Net result'},
err:{de:'Bericht konnte nicht geladen werden',ar:'تعذر تحميل التقرير',en:'Could not load the report'},showFirst:{de:'Bitte zuerst den Bericht anzeigen.',ar:'اعرض التقرير أولاً.',en:'Show the report first.'},
item:{de:'Posten',ar:'البند',en:'Item'},value:{de:'Wert',ar:'القيمة',en:'Value'},netShort:{de:'Gewinn/Verlust',ar:'صافي الربح/الخسارة',en:'Net profit/loss'}
};
const $=id=>document.getElementById(id),t=k=>FT.t(k);let report=null;const today=()=>window.NARA_DAY?NARA_DAY.today():new Date().toISOString().slice(0,10);
function money(c){return `${(Number(c||0)/100).toFixed(2)} €`;}
function paint(){if(!report)return;$('sales').textContent=money(report.salesCents);$('purchases').textContent=money(report.purchasesCents);$('labor').textContent=money(report.laborCents);$('profit').textContent=money(report.profitCents);$('profit').style.color=report.profitCents>=0?'#18834b':'#c83b1d';
$('details').innerHTML=`<div><span>${t('period')}</span><strong dir="ltr">${report.from} → ${report.to}</strong></div><div><span>${t('sales')}</span><strong>${money(report.salesCents)}</strong></div><div><span>${t('purch')}</span><strong>${money(report.purchasesCents)}</strong></div><div><span>${t('labor')}</span><strong>${money(report.laborCents)}</strong></div><div><span>${t('operating')}</span><strong>${money(report.operatingCents)}</strong></div><div><span>${t('costs')}</span><strong>${money(report.costsCents)}</strong></div><div><span>${t('result')}</span><strong>${money(report.profitCents)}</strong></div>`;}
async function loadReport(){const r=await fetch(`/api/reports/profit-loss?from=${$('from').value}&to=${$('to').value}`);const j=await r.json();if(!r.ok)throw Error(j.error||t('err'));report=j.report;paint();}
function exportReport(){if(!report){alert(t('showFirst'));return;}const rows=[[t('item'),t('value')],[t('sales'),report.salesCents/100],[t('purch'),report.purchasesCents/100],[t('labor'),report.laborCents/100],[t('operating'),report.operatingCents/100],[t('netShort'),report.profitCents/100]];const csv='﻿'+rows.map(r=>r.join(';')).join('\r\n'),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`flamo-profit-loss-${report.from}-${report.to}.csv`;a.click();}
FT.init(T,{onChange:paint});$('from').value=today();$('to').value=today();loadReport().catch(e=>$('details').textContent=e.message);
