'use strict';
/*
 * NARA allergen source of truth.
 * Populate only from supplier specifications or the original product label.
 * An absent record means "not confirmed" — the guide must never infer allergens
 * from a product name, recipe text, or a customer's request.
 */
const allergenRegistry={
  updated:'2026-09-13',
  source:'Supplier specification or owner-confirmed recipe record required',
  items:{},
  options:{}
};
/* Owner-confirmed bread recipes: all burger buns contain wheat/gluten, milk and sesame.
   All French Taco tortillas contain wheat/gluten and milk; they contain no sesame by recipe. */
if(typeof catalog!=='undefined'){
  const burgerBun={status:'confirmed',contains:['Gluten (Weizen)','Milch','Sesam'],mayContain:[],source:'Inhaberbestätigung · Burger-Bun-Rezept',updated:'2026-09-13'};
  const tacoTortilla={status:'confirmed',contains:['Gluten (Weizen)','Milch'],mayContain:[],source:'Inhaberbestätigung · Taco-Tortilla-Rezept',updated:'2026-09-13'};
  for(const item of catalog){
    const text=(item.n+' '+item.d).toLocaleLowerCase('de');
    if(/burger/.test(text))allergenRegistry.items[item.id]=burgerBun;
    if(item.c==='French Tacos')allergenRegistry.items[item.id]=tacoTortilla;
  }
  /* Real American Chicken Nuggets Halal, item no. 482671: ingredient list names wheat flour,
     wheat starch, durum wheat semolina and wheat. Other allergens are not asserted here. */
  const realAmericanNugget={status:'confirmed',contains:['Gluten (Weizen)'],mayContain:[],source:'Real American Chicken Nuggets Halal · Artikel 482671 · Zutatenliste',updated:'2026-09-13'};
  for(const id of [51,52,180])allergenRegistry.items[id]=realAmericanNugget;

  /* Merge confirmed components instead of losing e.g. the confirmed bun allergens
     when a supplier-confirmed patty or dressing is added to the same product. */
  const addConfirmedComponent=(id,component)=>{
    const current=allergenRegistry.items[id]||{status:'confirmed',contains:[],mayContain:[],source:'',updated:'2026-09-13'};
    allergenRegistry.items[id]={
      status:'confirmed',
      contains:[...new Set([...(current.contains||[]),...(component.contains||[])])],
      mayContain:[...new Set([...(current.mayContain||[]),...(component.mayContain||[])])],
      source:[current.source,component.source].filter(Boolean).join(' · '),
      updated:'2026-09-13'
    };
  };

  /* Real American Crispy Chicken Burger, item no. 476592: the stated coating
     contains wheat and the recipe names soy oil and soy protein. We do not infer
     milk or egg absence from this supplier specification. */
  const realAmericanCrispyChicken={status:'confirmed',contains:['Gluten (Weizen)','Soja'],mayContain:[],source:'Real American Crispy Chicken Burger · Artikel 476592 · Zutatenliste',updated:'2026-09-13'};
  /* Owner confirmation: every Chicken Burger that uses a chicken patty uses this
     same Real American crispy patty. Pulled chicken and non-patty chicken items
     are deliberately excluded. */
  for(const id of [5,11,12,13,15,18,19,103,104,106,108,111,114,116])addConfirmedComponent(id,realAmericanCrispyChicken);

  /* P&W Burger Dressing 900 g: declared allergens are egg and mustard. Only the
     burgers explicitly described with this burger dressing are linked here. */
  const pwBurgerDressing={status:'confirmed',contains:['Ei','Senf'],mayContain:[],source:'P&W Burger Dressing 900 g · deklarierte Allergene',updated:'2026-09-13'};
  for(const id of [12,14,15,104,115,116])addConfirmedComponent(id,pwBurgerDressing);

  /* Salomon Chili Cheese Burger Sauce, 2 l: declared allergens are milk and egg.
     Linked only where the product description explicitly says Chili-Cheese Sauce. */
  const salomonChiliCheese={status:'confirmed',contains:['Milch','Ei'],mayContain:[],source:'Salomon Chili Cheese Burger Sauce · deklarierte Allergene',updated:'2026-09-13'};
  for(const id of [19,20,113,114,152,153,171])addConfirmedComponent(id,salomonChiliCheese);
  allergenRegistry.options['chilli-cheese']=salomonChiliCheese;

  /* EDEKA Foodservice Classic Delikatess Mayonnaise 80%: declared allergens are
     egg and mustard. This covers only plain Mayonnaise, not named sauces such as
     Joppie, Truffle Mayo or Hot Chilli Mayo, which need their own product data. */
  const edekaMayonnaise={status:'confirmed',contains:['Ei','Senf'],mayContain:[],source:'EDEKA Foodservice Classic Delikatess-Mayonnaise 80% · Artikel 3983705003',updated:'2026-09-13'};
  for(const item of catalog){
    const text=(item.n+' '+item.d).toLocaleLowerCase('de');
    if(/\bmayonnaise\b/.test(text)&&!/joppie|truffle|hot chilli|spicy/.test(text))addConfirmedComponent(item.id,edekaMayonnaise);
  }
  allergenRegistry.options.mayo=edekaMayonnaise;
  allergenRegistry.options['menu-sauce-mayo']=edekaMayonnaise;

  /* EDEKA Foodservice Premium Tomaten-Ketchup, article 3982694001: the supplier
     lists no declarable allergens. This is deliberately displayed as "none listed",
     never as an absolute allergy-free guarantee. */
  const edekaKetchup={status:'confirmed',contains:[],mayContain:[],source:'EDEKA Foodservice Premium Tomaten-Ketchup · Artikel 3982694001 · keine Allergene deklariert',updated:'2026-09-13'};
  for(const item of catalog){
    const text=(item.n+' '+item.d).toLocaleLowerCase('de');
    if(/\bketchup\b/.test(text))addConfirmedComponent(item.id,edekaKetchup);
  }
  allergenRegistry.options.ketchup=edekaKetchup;
  allergenRegistry.options['menu-sauce-ketchup']=edekaKetchup;

  /* Owner-supplied label declaration for Joppiesauce 2.5 kg. */
  const joppieSauce={status:'confirmed',contains:['Ei','Soja','Gluten (Weizen)','Sellerie','Senf'],mayContain:[],source:'Inhaberangabe · Joppiesauce 2,5 kg · Allergenkennzeichnung',updated:'2026-09-13'};
  for(const item of catalog){
    const text=(item.n+' '+item.d).toLocaleLowerCase('de');
    if(/joppie/.test(text))addConfirmedComponent(item.id,joppieSauce);
  }
  for(const optionId of ['joppie','extra-joppie','menu-extra-joppie'])allergenRegistry.options[optionId]=joppieSauce;
}
function allergenRecord(kind,id){
  const table=kind==='option'?allergenRegistry.options:allergenRegistry.items;
  return table[id]||{status:'unconfirmed',contains:[],mayContain:[],source:null,updated:null};
}
function allergenAnswerForItem(item){
  const record=allergenRecord('item',item.id);
  if(record.status!=='confirmed')return 'Für dieses Produkt liegen noch keine vom Lieferanten freigegebenen Allergenangaben vor. Ich kann deshalb keine sichere Zusage geben — bitte direkt im Restaurant nachfragen.';
  const contains=record.contains.length?'Enthält: '+record.contains.join(', ')+'. ':'Keine deklarationspflichtigen Allergene in den bestätigten Angaben. ';
  const mayContain=record.mayContain.length?'Kann Spuren enthalten: '+record.mayContain.join(', ')+'. ':'';
  return contains+mayContain+'Bitte beachte: Kreuzkontakt in der Küche kann nur das Restaurant vor Ort bestätigen.';
}
function allergenStatusForItem(item){return allergenRecord('item',item.id).status==='confirmed'?'Allergenangaben vom Lieferanten bestätigt.':'Allergenangaben noch nicht vom Lieferanten bestätigt.';}
