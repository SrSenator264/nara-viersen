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
      note.textContent=ready?`تكلفة المواد محسوبة من وصفات مرتبطة بالمخزون (${recipes.length} وصفة).`:`تكلفة المواد تقديرية 30% حالياً. تم إنشاء ${recipes.length} مسودات وصفات، لكن لا توجد مكونات وكميات معتمدة بعد من أصل ${inventory.length} صنف مخزون.`;
      note.classList.toggle('cost-ready',ready);
    }catch(error){console.warn('[NARA][SETTLEMENT_COST_STATUS_FAILED]',error.message)}
  };
  document.addEventListener('DOMContentLoaded',refresh);
})();
