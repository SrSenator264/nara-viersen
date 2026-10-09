'use strict';
(()=>{
  const refresh=async()=>{
    const note=document.querySelector('#settlement-note');
    if(!note)return;
    try{
      const response=await fetch('/api/admin-data',{cache:'no-store'});
      const data=await response.json();
      const recipes=Array.isArray(data.recipes)?data.recipes:[];
      const inventory=Array.isArray(data.inventoryItems)?data.inventoryItems:[];
      const ready=recipes.some(recipe=>Array.isArray(recipe.ingredientLines)&&recipe.ingredientLines.length>0);
      const r=recipes.length,n=inventory.length,lang=(()=>{try{if(window.NARA_LANG)return window.NARA_LANG.get();const l=localStorage.getItem('nara-kasse-language');return ['de','ar','en'].includes(l)?l:'de'}catch(e){return 'de'}})();
      const T={
        de:{ready:`Materialkosten aus Rezepten mit Lagerbezug berechnet (${r} Rezepte).`,estimate:`Materialkosten vorerst mit 30 % geschätzt. ${r} Rezeptentwürfe angelegt, aber noch keine bestätigten Zutaten und Mengen (bei ${n} Lagerartikeln).`},
        ar:{ready:`كلفة المواد محسوبة من وصفات مربوطة بالمخزون (${r} وصفة).`,estimate:`كلفة المواد هلق تقديرية 30%. عملنا ${r} مسودة وصفة، بس لسّا ما في مكوّنات وكميات معتمدة (من أصل ${n} صنف بالمخزون).`},
        en:{ready:`Material cost calculated from inventory-linked recipes (${r} recipes).`,estimate:`Material cost is a 30% estimate for now. ${r} recipe drafts created, but no confirmed ingredients and amounts yet (out of ${n} inventory items).`}};
      note.textContent=(T[lang]||T.de)[ready?'ready':'estimate'];
      note.classList.toggle('cost-ready',ready);
    }catch(error){console.warn('[NARA][SETTLEMENT_COST_STATUS_FAILED]',error.message)}
  };
  document.addEventListener('DOMContentLoaded',refresh);
})();
