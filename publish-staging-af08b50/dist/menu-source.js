// Read from the rendered public Lieferando menu on 2026-09-09.
// Names/prices verified against that snapshot, not owner-approved or complete modifier data.
const menuSource={url:'https://www.lieferando.de/speisekarte/iu-gene',checked:'2026-09-09',complete:false};
catalog.forEach(p=>{p.verified=false;});
// The old standalone Extras card is redundant: extras are selected inside each product.
catalog.splice(catalog.findIndex(p=>p.id===8),1);
// The old vegetarian preview is not part of the active owner menu.
catalog.splice(catalog.findIndex(p=>p.id===7),1);
const corrected=[
 [1,'Smashed Beef Burger',899,'Zwei Rindfleisch-Patties (160 g), Cheddar, Salat und cremige Champignon-Burgersoße mit Pilzstücken. Burger-Bun.'],
 [2,'Cheese Burger',799,'Rindfleisch, Cheddar, Salat, Tomaten, rote Zwiebeln, Ketchup und Mayonnaise im Sesam-Bun.'],
 [3,'Guacamole Beef Burger',999,'Rindfleischpatty (150 g), Cheddar, Tomaten, rote Zwiebeln, Salat, Gurken und Guacamole-Style-Soße.'],
 [5,'Cheese chicken burger',699,'Crispy Chicken aus Hähnchenbrust, Cheddar, Salat, rote Zwiebeln, Gurken, Ketchup und Mayonnaise im Sesam-Bun.']
];
for(const [id,n,cents,d] of corrected)Object.assign(catalog.find(p=>p.id===id),{n,cents,p:cents/100,d,verified:true});
const imported=[
 [10,'Burger','Joppie Beef burger',849,'Rindfleisch, Tomaten, Gurken, rote Zwiebeln, Cheddar und Joppie-Sauce im Sesam-Brioche-Bun.'],
 [11,'Burger','Joppie Chicken Burger',799,'Hähnchenfilet-Patty, Gurken, rote Zwiebeln, Cheddar und Joppie-Sauce im Sesam-Brioche-Bun.'],
 [12,'Burger',"Crunchy Chik’n Burger",699,'Hähnchenbrust, Salat, Gurken, rote Zwiebeln, Cheddar und cremige Burgersoße im Sesam-Bun.'],
 [13,'Burger','Mega Crispy Chicken Zinger (Scharf)',1049,'Knusprige Zinger-Chickenbrust, Cheddar, Salat, Gurken, rote Zwiebeln und pikante Zinger-Soße im Sesam-Bun.'],
 [14,'Burger','XXXL Beef Burger',1599,'Drei Lagen Rindfleisch (300 g), Cheddar, Salat, Tomaten, rote Zwiebeln, Gurken und Burgersoße.'],
 [15,'Burger',"XXXL Chik’n Burger",1399,'Drei Chicken-Patties, zwei Chester-Käse, Salat, rote Zwiebeln, Gurken und cremige Burgersoße im Sesam-Bun.'],
 [16,'Burger','Original Hamburger',649,'Rindfleisch, Salat, Tomaten, rote Zwiebeln, Gurken, Ketchup und Mayonnaise im Sesam-Bun.'],
 [17,'Burger','Big Beef Burger',1299,'Zwei Rindfleisch-Patties (200 g), zweimal Cheddar, Eisbergsalat, rote Zwiebeln, Tomaten, Gurken und Big Burger Sauce.'],
 [18,'Burger','Big Chicken Burger',1199,'Zwei Chicken-Patties, zweimal Cheddar, Eisbergsalat, rote Zwiebeln, Gurken und Big Sauce im Sesam-Bun.'],
 [19,'Burger','Chill cheese Crunchy Chicken',749,'Hähnchenfilet, Chili-Cheese-Soße, Salat, Jalapeños und rote Zwiebeln im Sesam-Bun.'],
 [20,'Burger','Chill Cheese Beef Burger',899,'Rindfleisch, Chili-Cheese-Soße, Tomaten, rote Zwiebeln, Salat und Jalapeños. Scharf.'],
 [21,'Burger','BBQ Burger',949,'Rindfleisch, Halal-Bacon, Cheddar, Salat, Tomaten, rote Zwiebeln und BBQ-Sauce.'],
 [22,'Burger','Surf and Turf Burger',1299,'Rindfleischpatty (150 g), drei Garnelen, Tomaten, Cheddar, Salat, gegrillte Zwiebeln und Original Burger Sauce.'],
 [23,'Burger','Veggie Burger',849,'Pflanzliches Patty, Tomaten, Salat, rote Zwiebeln, Gurken, Mayonnaise und Ketchup.'],
 [24,'Burger',"Mini pulled chik’n BBQ Burger (4 Stück)",799,'Vier Mini-Burger mit gezupftem Hähnchen, BBQ-Sauce, Salat, Tomaten und Zwiebeln.'],
 [30,'Korean Wings','Korean Classic Yangnyeom Wings',1199,'6 Wings mit klassisch-süßer Korean-Yangnyeom-Glaze und geröstetem Sesam. Mild.'],
 [31,'Korean Wings','Creamy Cheese Bomb Wings',1199,'6 Wings mit warmer Cheddar-Käsesauce und Spicy-Mayo. Scharf.'],
 [32,'Korean Wings','Original Korean Chili Wings',1199,'6 Wings mit feuriger, leicht süßlicher Korean-Chili-Glaze und Sesam. Scharf.'],
 [33,'Korean Wings','Tokyo Teriyaki Wings',1199,'6 Wings in Teriyaki-Glaze, garniert mit Sesam.'],
 [34,'Korean Wings','Truffle Mayo Gourmet Wings',1199,'6 Wings mit cremiger Truffle-Mayonnaise.'],
 [35,'Korean Wings','Spicy Buffalo Wings (US-Style)',1199,'6 Wings in pikant-scharfer Buffalo-Soße.'],
 [40,'Buckets','Ultra Wings Bucket',1899,'12 knusprige Chicken Wings mit bis zu 2 Saucen nach Wahl. Inkl. 2x Dip & 1x Pommes.'],
 [41,'Buckets','Crispy Tenders Bucket',2399,'12 zarte, extra knusprige Chicken Tenders (ohne Knochen). Inkl. 2x Dips nach Wahl & 1x Pommes.'],
 [42,'Buckets','Half & Half Bucket',2499,'Die perfekte Kombination: 6 knusprige Wings & 6 zarte Crispy Tenders. Inkl. 3x Dips & 1x Pommes.'],
 [43,'Buckets','Ultimate Variety Bucket',2799,'Der große Mix zum Teilen: 6x Wings, 4x Crispy Tenders & 6x Chicken Nuggets. Inkl. 3x Dips nach Wahl & 1x Pommes.'],
 [50,'Angebot','Wings 16 Stück',1299,'16 knusprig frittierte Wings.'],
 [51,'Angebot','Nuggets 16 Stück',999,'16 knusprig frittierte Nuggets.'],
 [52,'Angebot','Mix – 8 Wings, 8 Nuggets',1199,'8 knusprige Chicken Wings und 8 knusprige Nuggets.']
];
for(const [id,c,n,cents,d] of imported)catalog.push({id,c,n,cents,p:cents/100,d,img:null,verified:true,optionsPending:c==='Buckets'});
// Lieferando offers are highlighted on the home page instead of in the category bar.
const offerPhotos={50:'offer-wings-16.jpg',51:'offer-nuggets-16.png',52:'offer-mix-16.png'};
for(const p of catalog.filter(p=>offerPhotos[p.id]))Object.assign(p,{img:'assets/'+offerPhotos[p.id],optionsPending:false});
for(const [id,n,d,img] of [
 [53,'3 für 2 Angebot – Cheese Chicken Burger','Crispy Chicken Patty aus Hähnchenbrustfleisch, Cheddar-Käse, frischer Salat, rote Zwiebeln, Gurken, Ketchup und Mayonnaise im Sesam-Bun.','offer-cheese-chicken.png'],
 [54,'3 für 2 Angebot – Cheese Beef Burger','Saftiges Rindfleisch, Cheddarkäse, Salat, frische Tomaten, rote Zwiebeln, Ketchup und Mayonnaise im Sesam-Bun.','offer-cheese-beef.png']
])catalog.push({id,c:'Angebot 3 für 2',n,cents:1599,p:15.99,d,img:'assets/'+img,verified:true,optionsPending:false});
// Owner screenshot: included dip counts known; actual choice lists still pending.
for(const p of catalog.filter(p=>p.c==='Buckets'))Object.assign(p,{c:'Chicken Buckets & Deals (New)',img:'assets/bucket-'+p.id+'.png',includedDips:p.id<=41?2:3});
const meals=[
 [100,'Flamin Hot Beef Menu',1999,'200 g Rindfleisch-Patty, doppelter Käse, Tomaten, scharfe Käsesoße, Pommes, Cola und eine große Käsesauce.'],
 [101,'Flamin Hot Chicken Menu',1999,'Chicken mit scharfer Käsesoße, Pommes, Cola und einer großen Käsesauce.'],
 [102,'Joppie Beef burger (Menu)',1449,'Joppie Beef Burger, Pommes, Dip und Getränk nach Wahl.'],
 [103,'Joppie Chicken Burger (Menu)',1399,'Joppie Chicken Burger, Pommes, Dip und Getränk nach Wahl.'],
 [104,"Crunchy Chik’n Burger (Menü)",1149,'Crunchy Chicken Burger, French Fries, Getränk und Dip nach Wahl.'],
 [105,'Cheese Burger (Menü)',1249,'Cheese Burger, French Fries, Getränk und Dip nach Wahl.'],
 [106,'Cheese chicken burger (menu)',1149,'Cheese Chicken Burger, French Fries, Getränk und Dip nach Wahl.'],
 [107,'Smashed Beef Burger (Menü)',1349,'Zwei smashed Beef-Patties, Cheddar, Salat und Champignonsoße. French Fries, Getränk und Dip nach Wahl.'],
 [108,'Mega Crispy Chicken Zinger (Menü)',1499,'Scharfer Zinger Chicken Burger mit French Fries, Getränk und Dip nach Wahl.'],
 [109,'Original Hamburger (Menü)',1199,'Original Hamburger, French Fries, Getränk und Dip nach Wahl.'],
 [110,'Big Beef Burger (Menü)',1749,'200 g Rindfleisch mit zweimal Cheddar und Big Burger Soße. French Fries, Getränk und Dip nach Wahl.'],
 [111,'Big Chicken Burger (Menü)',1649,'Zwei Chicken-Patties mit zweimal Cheddar und Big Burger Soße. French Fries, Getränk und Dip nach Wahl.'],
 [112,'BBQ Burger (Menü)',1399,'BBQ Burger mit Halal-Bacon, French Fries, Getränk und Dip nach Wahl.'],
 [113,'Chill Cheese Beef Burger (Menü)',1349,'Chili-Cheese-Beef-Burger mit Jalapeños, French Fries, Getränk und Dip nach Wahl. Scharf.'],
 [114,'Chill Cheese Crunchy Chicken (Menü)',1199,'Chili-Cheese-Chicken-Burger mit Jalapeños, French Fries, Getränk und Dip nach Wahl. Scharf.'],
 [115,'XXXL Beef burger (Menü)',1999,'Drei Lagen Rindfleisch (300 g), Cheddar und Burgersoße. French Fries, Getränk und Dip nach Wahl.'],
 [116,'XXXL crunchy chicken burger (Menü)',1849,'Drei Chicken-Patties, Chester-Käse und Burgersoße. French Fries, Getränk und Dip nach Wahl.'],
 [117,'Guacamole Beef Burger (Menü)',1449,'150 g Rindfleischpatty, Cheddar und Avocado-Soße. French Fries, Getränk und Dip nach Wahl.'],
 [118,'Surf and Turf Burger (Menü)',1749,'150 g Rindfleischpatty, drei Garnelen und Cheddar. French Fries, Getränk und Dip nach Wahl.'],
 [119,'Veggie Burger (Menü)',1299,'Veganes Patty, Tomaten, Salat, rote Zwiebeln und vegane Mayonnaise. French Fries, Getränk und Dip nach Wahl.'],
];
for(const [id,n,cents,d] of meals)catalog.push({id,c:'Burger-Menü',n,cents,p:cents/100,d,img:null,verified:true,fromPrice:true,optionsPending:true});
// Keep unverified legacy items visible only with an explicit review label.
// Never transfer an image to another product merely because the names look similar.
// Owner-confirmed section and optional dips, 2026-09-10. BBQ explicitly confirmed at 199 cents.
const wingsPhotos={30:'yangnyeom',31:'cheese-bomb',32:'korean-chili',33:'teriyaki',34:'truffle-mayo',35:'buffalo'};
const wingsDips=[['mayo','Mayonnaise',49],['ketchup','Ketchup',49],['aioli','Aioli',149],['chilli-scharf','Chili-Scharf Sauce',149],['bbq','Barbecuesauce',149],['chilli-cheese','Chillicheese Sauce',149],['cheese','Cheese Sauce',149],['senf','Senf',149],['joppie','Joppie Sauce',149],['lemon','Lemon Sauce',149],['truffle','Truffle Mayo',149],['teriyaki','Teriyaki Sauce',149],['haus','Haus Sauce',149],['garlic','Garlic Sauce',149],['garlic-cheese','Garlic Cheese Sauce',149],['buffalo','Buffalo Sauce',149],['hot-mayo','Hot Chilli Mayo',149]].map(([id,name,cents])=>({id,name,cents}));
for(const p of catalog)if(wingsPhotos[p.id])Object.assign(p,{c:'Korean & Fusion Wings',img:'assets/wings-'+wingsPhotos[p.id]+'.png',dips:wingsDips,optionsPending:false});
// Remove the obsolete generic preview duplicate, not an actual menu item.
catalog.splice(catalog.findIndex(p=>p.id===4),1);
// Burger options supplied by owner. No promotional prices applied.
const burgerExtras=[['double-beef','Double Beef Extra',899],['beef','Beef, extra',450],['triple-beef','Triple Beef Extra',1145],['chicken','Chicken, extra',450],['double-chicken','Double Chicken Patty Extra',799],['triple-chicken','Triple Chicken Patty Extra',1199],['cheese','Käse, extra',120],['double-cheese','Double Käse Extra',250],['triple-cheese','Triple Käse Extra',399],['camembert','Back-Camembert',300],['egg','Ei',99],['bacon','Bacon',120],['jalapenos','Jalapeños',99],['onions','Knusprig gebratene Zwiebeln',49],['sauce','Sauce, extra',99],['mustard','Senf, extra',99],['aioli','Aioli Sauce Extra',99],['bbq','Barbecuesauce',99],['cheese-sauce','Käsesauce',99],['hot-sauce','Chilli Scharf Sauce Extra',99],['honey','Honig Extra',199],['pineapple','Ananas Extra',199],['cherry','Kirschmarmelade Extra',149],['joppie','Joppie Sauce Extra',99]].map(([id,name,cents])=>({id:'extra-'+id,name,cents,group:'Ihre Extras'}));
const burgerDrinks=[
 ['cola-1','Coca-Cola 1,0 l',349,null,'1 l · 3,49 €/l'],
 ['fanta','Fanta Orange 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l'],
 ['zero','Coca-Cola Zero Sugar 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 10 mg/100 ml'],
 ['sprite','Sprite 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l'],
 ['tea-lemon','Fuze Tea Schwarzer Tee Zitrone 0,4 l (EINWEG)',324,25,'0,4 l · 8,10 €/l'],
 ['moloko','Softdrink-Moloko 0,25 l',374,25,'0,25 l · 14,96 €/l'],
 ['redbull-coconut','Kokos Blaubeere Red Bull 0,25 l',364,25,'0,25 l · 14,56 €/l'],
 ['mezzo','Mezzo Mix 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 6 mg/100 ml'],
 ['cola','Coca-Cola 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 10 mg/100 ml'],
 ['tea-peach','Fuze Tea Schwarzer Tee Pfirsich 0,4 l (EINWEG)',324,25,'0,4 l · 8,10 €/l'],
 ['fanta-kiwi','Fanta Strawberry & Kiwi 0,33 l',224,25,'0,33 l · 6,79 €/l'],
 ['moloko-cranberry','Cranberry-Moloko 0,25 l',374,25,'0,25 l · 14,96 €/l'],
 ['redbull','Red Bull 0,25 l (EINWEG)',364,25,'0,25 l · 14,56 €/l · Koffein: 32 mg/100 ml']
].map(([id,name,cents,deposit,detail])=>({id:'drink-'+id,name,cents,deposit,detail,group:'Ihr alkoholfreies Getränk'}));
const burgerOrder=[10,11,12,2,5,1,13,14,15,3,16,17,18,19,20,21,22,23,24];
const beefBurgerIds=new Set([10,2,1,14,3,16,17,20,21,22]);
const chickenBurgerIds=new Set([11,12,5,13,15,18,19,24]);
for(const id of burgerOrder){const p=catalog.find(p=>p.id===id);const c=beefBurgerIds.has(id)?'Beef Burger':chickenBurgerIds.has(id)?'Chicken Burger':'Veggie Burger';Object.assign(p,{c,img:'assets/burger-'+id+'.png',dips:[...burgerExtras,...wingsDips.map(d=>({...d,group:'Dips'}))]});}
// Keep the owner-defined visual sequence while dividing it into Beef, Chicken and the Vegan burger.
const burgerSlots=catalog.map((p,i)=>burgerOrder.includes(p.id)?i:-1).filter(i=>i>=0),orderedBurgers=burgerOrder.map(id=>catalog.find(p=>p.id===id));
burgerSlots.forEach((slot,i)=>{catalog[slot]=orderedBurgers[i];});
// Owner-supplied Burger-Menü modifiers. Separate from standalone Burger prices.
const menuExtras=[['beef','Beef, extra',450],['double-beef','Double Beef Extra',899],['triple-beef','Triple Beef Extra',1145],['chicken','Chicken, extra',450],['cheese-sauce','Käsesauce, extra',99],['double-chicken','Double Chicken Patties Extra',799],['triple-chicken','Triple Chicken Patties Extra',1145],['cheese','Käse, extra',120],['double-cheese','Double Käse Extra',250],['triple-cheese','Triple Käse Extra',399],['bacon','Bacon, extra',120],['camembert','Camembert',300],['egg','Ei',99],['jalapenos','Jalapeños, extra',99],['joppie','Joppie Sauce Extra',99],['aioli','Aioli Sauce Extra',99],['guacamole','Guacamole Sauce Extra',150],['sauce','Sauce, extra',99],['bbq','Barbecuesauce, extra',99],['onions','Knusprig gebratene Zwiebeln',49]].map(([id,name,cents])=>({id:'menu-extra-'+id,name,cents,group:'Ihre Extras'}));
const menuDrinks=[
 ['none','Ohne Getränk',0,0,''],
 ['lemon','Fanta Lemon & Elderflower 0,33 l',0,25,'0,33 l'],
 ['zero','Coca-Cola Zero Sugar 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
 ['mango','Fanta Mango & Dragonfruit 0,33 l',0,25,'0,33 l',true],
 ['tea-lemon','Fuze Tea Schwarzer Tee Zitrone 0,4 l (EINWEG)',75,25,'0,4 l'],
 ['mezzo','Mezzo Mix 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 6 mg/100 ml'],
 ['kiwi','Fanta Strawberry & Kiwi 0,33 l',0,25,'0,33 l',true],
 ['sprite','Sprite 0,33 l (EINWEG)',0,25,'0,33 l'],
 ['cola','Coca-Cola 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
 ['orange','Fanta Orange 0,33 l (EINWEG)',0,25,'0,33 l'],
 ['cola-1','Coca-Cola 1,0 l',149,1,'1 l · 1,49 €/l']
].map(([id,name,cents,deposit,detail,unavailable=false])=>({id:'menu-drink-'+id,name,cents,deposit,detail,unavailable,required:true,group:'Ihr Getränk'}));
const menuSauces=[['mayo','Mit Mayonnaise',0],['ketchup','Mit Ketchup',0],['cheese','Mit Cheesesauce',149],['none','Ohne Sauce',0]].map(([id,name,cents])=>({id:'menu-sauce-'+id,name,cents,required:true,group:'Ihre Sauce'}));
for(const p of catalog.filter(p=>p.c==='Burger-Menü'))Object.assign(p,{optionsPending:false,requiredGroups:['Ihr Getränk','Ihre Sauce'],dips:[...menuExtras,...menuDrinks,...menuSauces,...wingsDips.map(d=>({...d,group:'Dips'}))],img:p.id<120?'assets/burger-menu-'+p.id+'.png':null});
// A burger and its menu are now one product. The old menu records are retained internally
// for their verified prices, but are not shown as a duplicate category.
const burgerMenuPairs=new Map([[10,102],[11,103],[12,104],[2,105],[5,106],[1,107],[13,108],[16,109],[17,110],[18,111],[21,112],[20,113],[19,114],[14,115],[15,116],[3,117],[22,118],[23,119]]);
for(const [burgerId,menuId] of burgerMenuPairs){
 const burger=catalog.find(p=>p.id===burgerId),menu=catalog.find(p=>p.id===menuId);
 if(!burger||!menu)continue;
 Object.assign(burger,{menuCents:menu.cents,menuImage:menu.img,menuDescription:menu.d,requiredGroups:['Ihr Getränk','Ihre Sauce'],mealGroups:['Ihr Getränk','Ihre Sauce'],dips:[...burgerExtras,...menuDrinks,...menuSauces,...wingsDips.map(d=>({...d,group:'Dips'}))]});
 Object.assign(menu,{hidden:true});
}
for(const p of catalog.filter(p=>p.c==='Burger-Menü'))Object.assign(p,{hidden:true});
// Owner rule: all four chicken buckets include exactly two freely chosen dips.
const bucketIncludedGroups=['Inklusive · Dip 1','Inklusive · Dip 2'];
const bucketDipOptions=[...bucketIncludedGroups.flatMap((group,i)=>wingsDips.map(d=>({...d,id:'included-'+i+'-'+d.id,cents:0,group,required:true}))),...wingsDips.map(d=>({...d,group:'Zusätzliche Dips · kostenpflichtig'}))];
const bucketDescriptions={40:'12 knusprige Chicken Wings.',41:'12 zarte, extra knusprige Chicken Tenders (ohne Knochen).',42:'6 knusprige Wings & 6 zarte Crispy Tenders.',43:'6 Wings, 4 Crispy Tenders & 6 Chicken Nuggets.'};
for(const p of catalog.filter(p=>p.c==='Chicken Buckets & Deals (New)'))Object.assign(p,{includedDips:2,optionsPending:false,requiredGroups:bucketIncludedGroups,dips:bucketDipOptions,d:bucketDescriptions[p.id]+' Inkl. 2 Dips frei nach Wahl & 1x Pommes. Gleiche Sorte zweimal möglich. Weitere Dips gegen Aufpreis.'});
// Crispyburger Bundles: owner text and screenshot. No extra paid options inferred.
const bundleSauceNames={aioli:'Mit Aioli',sweet:'Mit Süß Sauer',cheese:'Mit Cheese Sauce',ketchup:'Mit Ketchup',bbq:'Mit Barbecuesauce',mayo:'Mit Mayonnaise',chilli:'Mit Chilli Cheese Sauce',garlic:'Mit Knoblauchsauce',none:'Ohne Sauce'};
const bundleCanDrinks={
 zero:['Coca-Cola Zero Sugar 0,33 l (EINWEG)','0,33 l · Koffein: 10 mg/100 ml'],
 cola:['Coca-Cola 0,33 l (EINWEG)','0,33 l · Koffein: 10 mg/100 ml'],
 lemon:['Fanta Lemon und Elderflower 0,33 l (EINWEG)','0,33 l'],
 sprite:['Sprite 0,33 l (EINWEG)','0,33 l'],
 orange:['Fanta Orange 0,33 l (EINWEG)','0,33 l'],
 mango:['Fanta Mango und Drachenfrucht 0,33 l (EINWEG)','0,33 l'],
 mezzo:['Mezzo Mix 0,33 l (EINWEG)','0,33 l · Koffein: 6 mg/100 ml'],
 kiwi:['Fanta Strawberry und Kiwi 0,33 l (EINWEG)','0,33 l'],none:['Ohne Getränk','']
};
const bundleDrinkOrders=[['zero','cola','lemon','sprite','orange','mango','mezzo','kiwi','none'],['none','orange','kiwi','zero','mango','mezzo','sprite','cola','lemon'],['none','lemon','mango','sprite','cola','zero','mezzo','kiwi','orange']];
const bundleDefinitions=[
 {id:130,n:'Duo Power Meal',cents:2799,d:'1 Cheese Beef-Burger, 1 Cheese Chicken Burger, 4 knusprige Hähnchenfilet-Stücke, eine große Portion Pommes, 2 Softdrinks nach Wahl und eine Sauce.',sauces:[['aioli','sweet','cheese','ketchup','bbq','mayo','chilli','none']],drinks:2},
 {id:131,n:'Friends Feast Combo',cents:4299,d:'1 Cheese Beef-Burger, 1 Crunchy Chicken Burger, 1 BBQ Burger, 6 knusprige Chicken Filets, 2 Pommes, 3 Getränke nach Wahl und 2 Saucen. Ideal zum Teilen mit Freunden.',sauces:[['sweet','aioli','bbq','ketchup','mayo','chilli','cheese','none'],['none','bbq','mayo','ketchup','cheese','chilli','aioli','sweet']],drinks:3},
 {id:132,n:'Family Mix Box',cents:5699,d:'2 Cheese Beef-Burger, 2 Crunchy Chicken Burger, 8 Crispy Chicken Filets, 2 große Pommes, 1,0 l Coca-Cola und 4 Saucen. Eine herzhafte Familienmahlzeit zum gemeinsamen Genießen.',sauces:[['cheese','aioli','chilli','ketchup','sweet','mayo','bbq','none'],['none','cheese','ketchup','sweet','mayo','chilli','bbq'],['none','bbq','cheese','aioli','sweet','chilli','mayo','ketchup'],['none','cheese','bbq','mayo','aioli','chilli','ketchup','sweet']],drinks:1,litre:true},
 {id:133,n:'Party Platter XL',cents:9999,d:'3 Cheese Beef-Burger, 3 Crunchy Chicken Burger, 12 Crispy Chicken Filets, 4 große Portionen Pommes Frites, 2,0 l Coca-Cola, 6 Saucen und ein großer Coleslaw-Salat – perfekt für große Gruppen und Partys.',sauces:[['sweet','chilli','aioli','cheese','ketchup','mayo','bbq','none'],['none','mayo','sweet','garlic','aioli','chilli','cheese','ketchup','bbq'],['none','bbq','cheese','aioli','sweet','chilli','mayo','ketchup'],['none','cheese','bbq','mayo','aioli','chilli','ketchup','sweet'],['none','mayo','ketchup','cheese','sweet','aioli','chilli','bbq'],['none','chilli','cheese','bbq','mayo','ketchup','sweet','aioli']],drinks:2,litre:true}
];
for(const b of bundleDefinitions){
 const dips=b.sauces.flatMap((ids,i)=>ids.map(id=>({id:'bundle-sauce-'+i+'-'+id,name:id==='none'&&i>0?'Ohne weitere Sauce':bundleSauceNames[id],cents:0,required:true,group:'Deine '+(i+1)+'. Sauce · inklusive'})));
 for(let i=0;i<b.drinks;i++){
 const ids=b.litre?['cola','none']:bundleDrinkOrders[i];
 dips.push(...ids.map(id=>({id:'bundle-drink-'+i+'-'+id,name:b.litre&&id==='cola'?'Coca-Cola 1,0 l (MEHRWEG)':id==='none'&&i>0?'Ohne weiteres Getränk':bundleCanDrinks[id][0],cents:0,deposit:id==='none'?0:b.litre?15:25,detail:id==='none'?'':b.litre?'1 l · Koffein: 10 mg/100 ml':bundleCanDrinks[id][1],unavailable:!b.litre&&id==='kiwi',required:true,group:'Dein '+(i+1)+'. Getränk · inklusive'})));
 }
 catalog.push({id:b.id,n:b.n,c:'Crispyburger Bundels',cents:b.cents,p:b.cents/100,d:b.d,img:'assets/bundle-'+b.id+'.png',verified:true,optionsPending:false,requiredGroups:[...new Set(dips.map(d=>d.group))],dips});
}
// French Tacos: owner-confirmed descriptions; Extra doubles tortilla and ingredients.
const tacoDesserts=[['caramel','Crispy Caramel-gefüllte Donut',0,true],['chocolate','Rich Chocolate Muffin',445,false],['berry','Filly Berry-gefüllte Donut',0,true],['nougat','Choconougat muffin Pof',445,false],['apple','Filly Apple Cinnamon muffin',0,true]].map(([id,name,cents,unavailable])=>({id:'dessert-'+id,name,cents,unavailable,priceUnknown:unavailable,group:'Ihr Dessert'}));
const tacoOptions=[...burgerExtras,...tacoDesserts,...burgerDrinks];
const tacoPairs=[
 [150,151,'Falafel Taco',849,1499,'Tortillas, Falafel, Tahinisauce, Tomaten, Salat, eingelegte Rote und Pommes frites.','falafel'],
 [152,153,'Chilli Cheese Beef Taco',899,1599,'Rindfleisch, Pommes, Chili-Cheese-Sauce, Champignons, Mais, rote Zwiebeln und Jalapeños. Scharf.','chilli-beef'],
 [6,154,'Taco Pollo',1049,1599,'Tortillas, Hähnchenstreifen, Chili-Tomatensauce, Pommes frites, rote Zwiebeln, Champignons, Mais und Käsesauce.','pollo'],
 [155,156,'BBQ Taco',849,1549,'Tortillas, Hähnchenstreifen, Pommes frites, Champignons, rote Zwiebeln, Mais und rauchige Barbecuesauce.','bbq'],
 [157,158,'Hot dog Taco',999,1499,'Zwiebeln, Hot dog, Salat, Champignons, Mais und Käsesauce.','hotdog'],
 [159,160,'Iu Gene Taco',1499,1899,'Tortillas, Rindfleisch, Hähnchenstreifen, Taco-Sauce, rote Zwiebeln, Käse und Pommes frites.','iu-gene'],
 [161,162,'Joppie Beef Taco',899,1599,'Tortillas, Rindfleisch, Pommes, Pilze, rote Zwiebeln, Gurken und Joppie-Sauce.','joppie-beef'],
 [163,164,'Joppie Chicken Taco',899,1499,'Tortillas, Hähnchenstreifen, Pommes, rote Zwiebeln, Pilze, Gurken und Joppie-Sauce.','joppie-chicken']
];
// Replace the old Taco Pollo preview while retaining its ID for existing references.
catalog.splice(catalog.findIndex(p=>p.id===6),1);
for(const [id,extraId,n,cents,extraCents,d,photo] of tacoPairs){
 const common={c:'French Tacos',verified:true,optionsPending:false,dips:tacoOptions};
 catalog.push({...common,id,n,cents,p:cents/100,d,img:'assets/taco-'+photo+'.png'});
 catalog.push({...common,id:extraId,n:'(Extra) '+n,cents:extraCents,p:extraCents/100,d:'Doppelte Tortillas und Zutaten. '+d,img:'assets/taco-'+photo+'.png'});
}
for(const [id,n,cents,d,photo] of [[165,'Shawarma tacos Hähnchenfleisch',999,'Tortilla, Hähnchenfleisch, eingelegte Gurken, Pommes und Knoblauchcreme.','shawarma-chicken'],[166,'Shawarma tacos (Fleisch)',1099,'Shawarma-Rindfleisch, Tahini, Zwiebeln, Gurken und Petersilie.','shawarma-beef']])catalog.push({id,n,cents,p:cents/100,d,c:'French Tacos',verified:true,optionsPending:false,dips:tacoOptions,img:'assets/taco-'+photo+'.png'});

// Specials: prices and descriptions transcribed from the owner's Lieferando screenshots.
const specials=[
 [170,'Double Fries',549,'Doppelte Pommes frites.','special-double-fries.png'],
 [171,'Chilli-Cheese Fries (scharf)',699,'Pommes frites mit Chili-Cheese-Sauce und Jalapeños.','special-chilli-cheese-fries.png'],
 [172,'Avocado Tots',649,'Pommes frites mit Avocadosauce.','special-avocado-tots.png'],
 [173,'Joppie Fries',699,'Pommes mit Joppiesauce.','special-joppie-fries.jpg'],
 [174,'Beef Loaded Fries',899,'Pommes frites mit klein geschnittenem Rindfleisch, Zwiebeln und Käsesauce.','special-beef-loaded-fries.png'],
 [175,"Chick’n Loaded Fries",899,'Pommes frites mit klein geschnittenem, knusprig frittiertem Hähnchenfleisch und Pommessauce.','special-chicken-loaded-fries.png'],
 [176,'Potato Pops',699,'Runde frittierte Kartoffelbällchen.','special-potato-pops.png'],
 [177,'Potato Curly Twister',699,'Pommes Twister.','special-curly-twister.png'],
 [178,'Onion Rings (10 Stück)',499,'Frittierte Zwiebelringe.','special-onion-rings.png'],
 [179,'Cheese Nuggets (7 Stück)',549,'Mit Chili und Cheddar.','special-cheese-nuggets.png'],
 [180,'Chicken Nuggets (8 Stück)',599,'Knusprig frittiert.','special-chicken-nuggets.png'],
 [181,'Crispy Shrimp Torpedo (6 Stück)',699,'Garnelen, bemehlt und frittiert.','special-shrimp-torpedo.png'],
 [182,'Mini-Frühlingsrollen',499,'Gefüllt mit Gemüse.','special-mini-spring-rolls.jpg'],
 [183,'Mozzarella Sticks (7 Stück)',699,'Mit knusprig paniertem Mozzarella.','special-mozzarella-sticks.png'],
 [184,'Virginia Chicken Wings BBQ (6 Stück)',699,'Milde, sanft marinierte Hähnchenflügel mit typischer Barbecue-Rauchnote.','special-virginia-wings.png'],
 [185,'Buffalo Chicken Wings (6 Stück, sehr scharf)',699,'Saftige, geteilte Hähnchenflügel, mariniert und gegart.','special-buffalo-wings.png'],
 [186,'Cheese Back-Camembert (3 Stück)',699,'Knusprig panierter Camembert.','special-camembert.png'],
 [187,'Special-Mix-Box',1249,'3 Crispy Shrimp Torpedo, 3 Chicken Nuggets, 4 Chicken Wings, 3 Cheese Nuggets und 2 Cheese Back-Camembert.','special-mix-box.png'],
 [188,'Gemüse Sauer Eingelegt',300,'Eingelegtes Gemüse.',null],
 [189,'Chicken Pops',699,'Kleine frittierte Chicken-Stücke.','special-chicken-pops.png'],
 [190,'Churrito Zimt & Zucker (5 Stück)',599,'Mit Zimt und Zucker.', 'special-churros.png'],
 [191,'Mais Kolben Stücken',399,'Maiskolben-Stücke. Vegan und vegetarisch.',null]
];
for(const [id,n,cents,d,photo] of specials)catalog.push({id,n,cents,p:cents/100,d,c:'Specials',img:photo?'assets/'+photo:null,verified:true,optionsPending:false});

// Salate: availability follows the current owner screenshot.
const salads=[
 [192,'Coleslaw Salat',599,'Weißkohl, Karotten, Zwiebeln, Dressing, Mayonnaise, Knoblauch, Essig, Zucker, Zitronensaft, Salz und Pfeffer.','Coleslaw Salat.jpg',false],
 [193,'Weiße Riesenbohnen',0,'In Tomatensauce.','Weiße Riesenbohnen.jpg',true],
 [194,'Kartoffelsalat',0,'Klassischer Kartoffelsalat.','Kartoffelsalat.jpg',true],
 [195,'Nudelsalat',0,'Frischer Nudelsalat.','Nudelsalat.jpg',true],
 [196,'Mexiko Salat',0,'Mit Paprika, Mais, Kidneybohnen, Gurken, Karotten und Silberzwiebeln.','Mexiko Salat.jpg',true],
 [197,'Pasta Salat',0,'Mit Nudeln, Tomaten, Paprika, Staudensellerie, Weißkohl, Zucchini und Balsamico Bianco.','Pasta Salat.jpg',true]
];
for(const [id,n,cents,d,img,unavailable] of salads)catalog.push({id,n,cents,p:cents/100,d,c:'Salate',img:'assets/'+img,unavailable,verified:true,optionsPending:false});

// Falafel: shared optional desserts and non-alcoholic drinks supplied by the owner.
const falafelDesserts=[
 ['choconougat','Choconougat muffin Pof',445,false],
 ['blueberry','Blue Berry Muffin',0,true],
 ['apple-cinnamon','Filly Apple Cinnamon muffin',0,true],
 ['chocolate','Rich Chocolate Muffin',445,false],
 ['berry-donut','Filly Berry-gefüllte Donut',0,true],
 ['caramel-donut','Crispy Caramel-gefüllte Donut',399,false]
].map(([id,name,cents,unavailable])=>({id:'falafel-dessert-'+id,name,cents,unavailable,priceUnknown:unavailable,group:'Ihr Dessert'}));
const falafelDrinks=[
 ['tea-peach','Fuze Tea Schwarzer Tee Pfirsich 0,4 l (EINWEG)',324,25,'0,4 l · 8,10 €/l'],
 ['redbull-coconut','Kokos Blaubeere Red Bull 0,25 l',364,25,'0,25 l · 14,56 €/l'],
 ['orange','Fanta Orange 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l'],
 ['kiwi','Fanta Strawberry & Kiwi 0,33 l',224,25,'0,33 l · 6,79 €/l'],
 ['cola','Coca-Cola 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 10 mg/100 ml'],
 ['sprite','Sprite 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l'],
 ['cola-1','Coca-Cola 1,0 l',334,15,'1 l · 3,34 €/l'],
 ['redbull','Red Bull 0,25 l (EINWEG)',364,25,'0,25 l · 14,56 €/l · Koffein: 32 mg/100 ml'],
 ['mezzo','Mezzo Mix 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 6 mg/100 ml'],
 ['tea-lemon','Fuze Tea Schwarzer Tee Zitrone 0,4 l (EINWEG)',324,25,'0,4 l · 8,10 €/l'],
 ['moloko-cranberry','Cranberry-Moloko 0,25 l',374,25,'0,25 l · 14,96 €/l'],
 ['moloko','Softdrink-Moloko 0,25 l',374,25,'0,25 l · 14,96 €/l'],
 ['zero','Coca-Cola Zero Sugar 0,33 l (EINWEG)',224,25,'0,33 l · 6,79 €/l · Koffein: 10 mg/100 ml']
].map(([id,name,cents,deposit,detail])=>({id:'falafel-drink-'+id,name,cents,deposit,detail,group:'Ihr alkoholfreies Getränk'}));
const falafelOptions=[...falafelDesserts,...falafelDrinks];
const falafelItems=[
 [198,'Falafel Sandwich',549,'Mit Petersilie, Sumach, Tahini, Essiggurken und Zitrone.','falafel-sandwich.png',false],
 [199,'Falafel Sandwich Extra',749,'Mit Ei und Pommes frites.','falafel-sandwich-extra.png',false],
 [200,'Falafel Teller',999,'Mit Salat, Essiggurken, Tomaten, Zitrone, Hummus und Tahine.','falafel-teller.png',false],
 [201,'Jalangi',499,'Weintraubenblätter gefüllt mit Reis, Tomaten, Knoblauch, Minze und Petersilie.','falafel-jalangi.png',false],
 [202,'Hummus',0,'Sesampaste mit Kichererbsen.','falafel-hummus.png',true]
];
for(const [id,n,cents,d,photo,unavailable] of falafelItems)catalog.push({id,n,cents,p:cents/100,d,c:'Falafel',img:'assets/'+photo,unavailable,verified:true,optionsPending:false,dips:falafelOptions});

// Falafel-Menü remains inside the Falafel category. Base price follows the standard Falafel Sandwich;
// the owner supplied the required dish, dip and drink choices below.
const falafelMenuChoices=[
 {id:'falafel-menu-dish-sandwich',name:'Falafel Sandwich',cents:0,required:true,group:'Ihr Gericht'},
 {id:'falafel-menu-dish-extra',name:'Falafel Sandwich Extra',cents:109,required:true,group:'Ihr Gericht'},
 {id:'falafel-menu-dip-mayo',name:'Mit Mayonnaise',cents:0,required:true,group:'Ihr Dip'},
 {id:'falafel-menu-dip-ketchup',name:'Mit Ketchup',cents:0,required:true,group:'Ihr Dip'},
 {id:'falafel-menu-dip-joppie',name:'Joppie Sauce',cents:99,required:true,group:'Ihr Dip'},
 {id:'falafel-menu-dip-none',name:'Ohne Dip',cents:0,required:true,group:'Ihr Dip'},
 ...[
  ['cola-1','Coca-Cola 1,0 l',135,15,'1 l · 1,35 €/l'],
  ['mango','Fanta Mango & Dragonfruit 0,33 l',0,25,'0,33 l',true],
  ['orange','Fanta Orange 0,33 l (EINWEG)',0,25,'0,33 l'],
  ['redbull-coconut','Red Bull Kokos-Blaubeere 0,25 l',125,25,'0,25 l · 5,00 €/l'],
  ['zero','Coca-Cola Zero Sugar 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
  ['sprite','Sprite 0,33 l (EINWEG)',0,25,'0,33 l'],
  ['mezzo','Mezzo Mix 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 6 mg/100 ml'],
  ['cola','Coca-Cola 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
  ['tea-lemon','Fuze Tea Schwarzer Tee Zitrone 0,4 l (EINWEG)',125,25,'0,4 l · 3,13 €/l'],
  ['redbull','Red Bull 0,25 l (EINWEG)',125,25,'0,25 l · 5,00 €/l'],
  ['tea-peach','Fuze Tea Schwarzer Tee Pfirsich 0,4 l (EINWEG)',125,25,'0,4 l · 3,13 €/l'],
  ['none','Ohne Getränk',0,0,'']
 ].map(([id,name,cents,deposit,detail,unavailable=false])=>({id:'falafel-menu-drink-'+id,name,cents,deposit,detail,unavailable,required:true,group:'Ihr Getränk'}))
];
catalog.push({id:203,n:'Falafel-Menü',c:'Falafel',cents:549,p:5.49,fromPrice:true,d:'Falafel Sandwich oder Falafel Sandwich Extra, mit Dip und Getränk nach Wahl.',img:'assets/falafel-menu.png',verified:true,optionsPending:false,requiredGroups:['Ihr Gericht','Ihr Dip','Ihr Getränk'],dips:falafelMenuChoices});

// Hot Dogs and their optional dessert and drink additions from the owner screenshot.
const hotDogItems=[
 [204,'3 für 2 Angebot – Hot Dogs Classic',1500,'Mit Geflügelwurst, Röstzwiebeln, Gewürzgurken, Senf, Ketchup, Mayonnaise und Brioche-Brötchen.','hotdog-classic.png',false],
 [205,'Hotdog Cheddar Dream',849,'Mit Cheddarsauce, knusprig gebratenen Zwiebeln und Gewürzgurken.','hotdog-cheddar.png',false],
 [206,'Hotdog Classic',749,'Mit Geflügelwurst, Röstzwiebeln, Gewürzgurken, Senf, Ketchup, Mayonnaise und Brioche-Brötchen.','hotdog-classic.png',false],
 [207,'Hotdog Chili (scharf)',749,'Mit Chilisauce, Jalapeños und Röstzwiebeln.','hotdog-chili.png',false],
 [208,'Hotdog BBQ',749,'Mit Barbecuesauce, Röstzwiebeln und Gewürzgurken.','hotdog-bbq.png',false],
 [209,'Hot Dog Pommes',749,'Mit Special-Pommes-Sauce, Pommes und Gewürzgurken.','hotdog-pommes.png',false],
 [210,'Currywurst mit Pommes Frites',0,'Mit Currysauce und Pommes frites.','hotdog-currywurst.png',true]
];
for(const [id,n,cents,d,photo,unavailable] of hotDogItems)catalog.push({id,n,cents,p:cents/100,d,c:'Hot Dogs',img:'assets/'+photo,unavailable,verified:true,optionsPending:false,dips:[...falafelDesserts,...falafelDrinks]});

// Sandwiches: owner screenshots, with the already supplied optional dessert, drink and dip choices.
const sandwichDips=wingsDips.map(d=>({...d,id:'sandwich-'+d.id,group:'Dips'}));
const sandwichItems=[
 [211,'Shawarma Rolle im Tortilla Brot',599,'Mit Hähnchenfleisch, eingelegten Gurken und Knoblauchcreme.','sandwich-shawarma-chicken.png'],
 [212,'Shawarma doppelt',899,'Shawarma Chicken im Baguette-Brot, Knoblauchcreme und Gurken.','sandwich-shawarma-chicken-double.png'],
 [213,'Shawarma (Fleisch) Rolle im Tortilla Brot',699,'Shawarma-Rindfleisch, Tahini, Zwiebeln und Gurken.','sandwich-shawarma-beef.png'],
 [214,'Shawarma doppelt (Fleisch)',1049,'Shawarma-Rindfleisch im Baguette-Brot, Tahini, Zwiebeln, Gurken und doppelte Zutaten.','sandwich-shawarma-beef-double.png'],
 [215,'Shawarma Arabi Platte',1399,'Shawarma-Rolle in einen Teller geschnitten, mit Hähnchenfleisch, eingelegten Gurken und Knoblauchcreme.','sandwich-shawarma-arabi-chicken.png'],
 [216,'Shawarma Fleisch Arabi Platte',1499,'Shawarma-Rolle in einen Teller geschnitten, mit Rindfleisch, eingelegten Gurken und Knoblauchcreme.','sandwich-shawarma-arabi-beef.png'],
 [217,'Falafel doppelt (vegan)',899,'Falafel-Sandwich im Baguette-Brot mit extra Falafelbällchen, Salat und Sauce.','sandwich-falafel-double.png'],
 [218,'Beef Jalo Sandwich',999,'Beef, Zwiebeln, Salat, Tomaten, Sauce, Jalapeños und Käse. Scharf.','sandwich-beef-jalo.png'],
 [219,'Hähnchen Crispy Filet Sandwich',999,'Hähnchen-Crispy-Filet, Mayonnaise, Coleslaw, Salat, Gurken und Zwiebeln im Baguette-Brot.','sandwich-crispy-filet.png'],
 [220,'Jumbo Philly Beef Sandwich',1499,'200 g Beef, zwei Käsescheiben, Tomaten, Gurken, Salat, Sauce, Zwiebeln und Granatapfelsirup.','sandwich-jumbo-beef.png'],
 [221,'Crunchy Chicken Cheesy Sandwich',1099,'Crunchy Chicken Breast, Chili-Cheese-Nuggets, Zwiebeln, Gurken und Salat.','sandwich-crunchy-cheesy.png'],
 [222,'Pommes Sandwich',749,'Pommes frites, Mayonnaise, Gurken, Ketchup, Käse und Coleslaw-Salat.','sandwich-pommes.png']
];
for(const [id,n,cents,d,photo] of sandwichItems)catalog.push({id,n,cents,p:cents/100,d,c:'Sandwiches',img:'assets/'+photo,verified:true,optionsPending:false,dips:[...sandwichDips,...falafelDesserts,...falafelDrinks]});

// Fried chicken: item details are verified from the owner screenshot; menu choice lists remain to be supplied.
catalog.push({id:223,n:'Crispy Chicken Filet Menü',c:'Fried Chicken',cents:1749,p:17.49,fromPrice:true,d:'8 Hähnchenfilet-Stücke, 1 Pommes frites, 1 Coleslaw-Salat, 1 Sauce und 1 alkoholfreies Getränk nach Wahl.',img:'assets/fried-menu.png',verified:true,optionsPending:true});
catalog.push({id:224,n:'Crispy Chicken Filet (4 Stück)',c:'Fried Chicken',cents:749,p:7.49,d:'Marinierte Hähnchenbrustfilet-Stücke, knusprig frittiert, inklusive 1 Sauce.',img:'assets/fried-filet-4.png',verified:true,optionsPending:true});
catalog.push({id:225,n:'Crispy Chicken Filet (6 Stück)',c:'Fried Chicken',cents:999,p:9.99,d:'Marinierte Hähnchenbrustfilet-Stücke, knusprig frittiert, inklusive 1 Sauce.',img:'assets/fried-filet-6.png',verified:true,optionsPending:true});

// Owner-supplied Fried Chicken choices: one included dip, optional paid extra dips, and a required drink for the menu.
const friedFreeDips=[['mayo','Mit Mayonnaise'],['ketchup','Mit Ketchup'],['none','Ohne Dip']].map(([id,name])=>({id:'fried-dip-'+id,name,cents:0,required:true,group:'Ihr Dip'}));
const friedPaidDips=wingsDips.map(d=>({...d,id:'fried-extra-'+d.id,group:'Zusätzliche Dips · kostenpflichtig'}));
const friedBurgerBun={id:'fried-burger-bun',name:'Burger Bun',cents:99,group:'Extras'};
const friedDrinks=[
 ['mezzo','Mezzo Mix 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 6 mg/100 ml'],
 ['redbull','Red Bull 0,25 l (EINWEG)',125,25,'0,25 l · 5,00 €/l · Koffein: 32 mg/100 ml'],
 ['cola-1','Coca-Cola 1,0 l',135,15,'1 l · 1,35 €/l'],
 ['tea-peach','Fuze Tea Schwarzer Tee Pfirsich 0,4 l (EINWEG)',125,25,'0,4 l · 3,13 €/l'],
 ['sprite','Sprite 0,33 l (EINWEG)',0,25,'0,33 l'],
 ['tea-lemon','Fuze Tea Schwarzer Tee Zitrone 0,4 l (EINWEG)',125,25,'0,4 l · 3,13 €/l'],
 ['mango','Fanta Mango & Dragonfruit 0,33 l',0,25,'0,33 l'],
 ['zero','Coca-Cola Zero Sugar 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
 ['cola','Coca-Cola 0,33 l (EINWEG)',0,25,'0,33 l · Koffein: 10 mg/100 ml'],
 ['orange','Fanta Orange 0,33 l (EINWEG)',0,25,'0,33 l'],
 ['none','Ohne Getränk',0,0,'']
].map(([id,name,cents,deposit,detail])=>({id:'fried-drink-'+id,name,cents,deposit,detail,required:true,group:'Ihr Getränk'}));
Object.assign(catalog.find(p=>p.id===223),{optionsPending:false,requiredGroups:['Ihr Getränk','Ihr Dip'],dips:[...friedDrinks,...friedFreeDips,...friedPaidDips,friedBurgerBun]});
for(const id of [224,225])Object.assign(catalog.find(p=>p.id===id),{optionsPending:false,requiredGroups:['Ihr Dip'],dips:[...friedFreeDips,...friedPaidDips,friedBurgerBun]});

// Dessert: prices and names verified from the owner-supplied menu screenshot.
const dessertItems=[
  [226,'Choconougat muffin Pof',445,'Schoko-Nougat-Muffin','muffen.webp'],
  [227,'Rich Chocolate Muffin',445,'Schokoladen-Muffin','chocolade muffin.jpg'],
  [228,'Blue Berry Muffin',445,'Blaubeer-Muffin','bluberry muffen.webp'],
  [229,'Pinky-Donut',199,'Mit rosa Glasur','Pinky-Donut.webp'],
  [230,'Crispy Caramel-gefüllte Donut',399,'Mit Karamellfüllung','crispy caramel.webp'],
  [231,'Schokoladen Black-Donut',199,'Mit Schokoladenglasur','Schokoladen Black-Donut.webp'],
  [232,'White Donut',199,'Mit weißer Glasur','white dounut.webp'],
  [233,'Brownie',399,'Dunkler Rührteigboden mit Schokoladencreme','Brownie.webp'],
  [234,'Tiramisu cafe',449,'Tiramisu cafe cake','tiramisu.webp'],
  [235,'Cheesecake',630,'Cheesecake','Cheesecake.webp'],
  [236,'Soufflé Al Cioccolato',449,'Soufflé Al Cioccolato','Soufflé Al Cioccolato.webp']
];
for(const [id,n,cents,d,img] of dessertItems)catalog.push({id,n,cents,p:cents/100,d,c:'Desserts',img:'assets/'+img,verified:true,optionsPending:false});

// Dips: owner-supplied ordering keeps the everyday pair (Mayonnaise and Ketchup) together and removes the duplicate Garlic Sauce card.
const dipItems=[
  [264,'Mayonnaise',49,'Cremige Mayonnaise','Mayonnaise.jpg'],
  [265,'Ketchup',49,'Klassisches Tomaten-Ketchup','Ketchup.jpg'],
  [266,'Aioli',149,'Würzige Knoblauchsauce','aioli.jpg'],
  [267,'Chili-Scharf Sauce',149,'Scharfe Chilisauce','Chili-Scharf Sauce.jpg'],
  [268,'Barbecuesauce',149,'Rauchige Barbecuesauce','Barbequesauce.jpg'],
  [269,'Chillicheese Sauce',149,'Scharfe Chili-Käsesauce','Chillicheese Sauce.jpg'],
  [270,'Cheese Sauce',149,'Cremige Käsesauce','Cheese sauce.jpg'],
  [271,'Senf',149,'Senf','Senf.jpg'],
  [272,'Joppie Sauce',149,'Würzige Joppiesauce','Joppie sauce.jpg'],
  [273,'Lemon Sauce',149,'Fruchtige Zitronensauce','Lemon Sauce.jpg'],
  [274,'Truffle Mayo',149,'Edle Trüffel-Mayonnaise','Turffel Mayo.jpg'],
  [275,'Teriyaki Sauce',149,'Asiatische Teriyaki-Sauce','Teriyaki Sauce.jpg'],
  [276,'Haus Sauce',149,'Hausgemachte Sauce','Haus Sauce.jpg'],
  [277,'Garlic Sauce',149,'Cremige Knoblauchsauce','Garlic Sauce.jpg']
];
for(const [id,n,cents,d,img] of dipItems)catalog.push({id,n,cents,p:cents/100,d,c:'Dips',img:'assets/'+img,verified:true,optionsPending:false});

// Frappuccino Series: each drink is available with or without cream. Dessert-menu drinks include two chosen donuts.
const frappeCreamChoices=[
  {id:'frappe-sahne',name:'Mit Sahne',cents:0,required:true,group:'Deine Sahne'},
  {id:'frappe-ohne-sahne',name:'Ohne Sahne',cents:0,required:true,group:'Deine Sahne'}
];
const frappeOrderChoices=menuCents=>[
  {id:'frappe-single',name:'Als Einzelgetränk',cents:0,required:true,group:'Deine Bestellung'},
  {id:'frappe-menu',name:'Als Menü mit 2 Donuts',cents:menuCents,required:true,group:'Deine Bestellung'}
];
const frappeItems=[
  [237,'Mango Cream Frappe 0,5l',649,'Erfrischendes Mango-Sahne-Frappé','Mango Cream Frappe.jpg'],
  [238,'Strawberry cream Frappe 0,5l',649,'Erfrischendes Erdbeer-Sahne-Frappé','Strawberry cream Frappe 0,5l.jpg'],
  [239,'Peach cream frappe 0,5l',649,'Erfrischendes Pfirsich-Sahne-Frappé','Peach cream frappe 0,5l.jpg'],
  [240,'Maracuja Cream frappe 0,5l',649,'Erfrischendes Maracuja-Sahne-Frappé','Maracuja Cream frappe 0.5l.jpg'],
  [241,'Mocha Cream Frappe 0,5l',649,'Erfrischendes Mokka-Sahne-Frappé','Mocha Cream Frappe 0,5l.jpg'],
  [242,'White Mocha Cream Frappe 0,5l',649,'Erfrischendes White-Mokka-Sahne-Frappé','White Mocha Cream Frappe 0,5l.jpg'],
  [243,'Vanilla Cream Frappe 0,5l',649,'Erfrischendes Vanille-Sahne-Frappé','Vanilla Cream Frappe 0,5l.jpg'],
  [244,'Caramel Cream Frappe 0,5l',649,'Erfrischendes Karamell-Sahne-Frappé','Caramel Cream Frappe 0,5l.jpg'],
  [245,'Mango Strawberry cream frappe 0,5l',749,'Erfrischendes Mango-Erdbeer-Sahne-Frappé','Mango Strawberry cream frappe 0,5l.jpg'],
  [246,'Strawberry white mocha cream frappe 0,5l',749,'Erfrischendes Erdbeer-White-Mokka-Sahne-Frappé','Strawberry white mocha cream frappe 0,5l.jpg'],
  [247,'Strawberry peach cream frappe 0,5l',749,'Erfrischendes Erdbeer-Pfirsich-Sahne-Frappé','Strawberry peach cream frappe 0,5l.jpg'],
  [248,'Caramel mocha cream frappe 0,5l',749,'Erfrischendes Karamell-Mokka-Sahne-Frappé','Caramel mocha cream frappe 0,5l.jpg'],
  [249,'Strawberry Mocha Cream frappe 0,5l',749,'Erfrischendes Erdbeer-Mokka-Sahne-Frappé','Strawberry Mocha Cream frappe 0,5l.jpg'],
  [250,'Caramel white mocha Cream frappe 0,5l',749,'Erfrischendes Karamell-White-Mokka-Sahne-Frappé','Caramel white mocha Cream frappe 0,5l.jpg'],
  [251,'Crème Brûlée Frappe 0,5l',749,'Erfrischendes Crème-Brûlée-Frappé','Crème Brûlée Frappe 0,5l.jpg'],
  [252,'Blueberry cream Frappe 0,5l',749,'Blueberry Geschmack und Milch nach Wahl','Blueberry cream Frappe 0,5l.jpg']
];
const donutMenuChoices=['Dein 1. Donut','Dein 2. Donut'].flatMap((group,index)=>[
  {id:'menu-donut-'+index+'-white',name:'White Donut',cents:0,required:true,group},
  {id:'menu-donut-'+index+'-pinky',name:'Pinky-Donut',cents:0,required:true,group},
  {id:'menu-donut-'+index+'-chocolate',name:'Schokoladen Black-Donut',cents:0,required:true,group},
  {id:'menu-donut-'+index+'-sprinkle',name:'Sprinkle Donut',cents:0,required:true,group}
]);
for(const [id,n,cents,d,img] of frappeItems)catalog.push({id,n,cents,p:cents/100,d,c:'Frappuccino Series',img:'assets/'+img,verified:true,optionsPending:false,fromPrice:true,requiredGroups:['Deine Bestellung','Deine Sahne','Dein 1. Donut','Dein 2. Donut'],conditionalGroups:{'Dein 1. Donut':['frappe-menu'],'Dein 2. Donut':['frappe-menu']},dips:[...frappeOrderChoices(cents===649?250:200),...frappeCreamChoices,...donutMenuChoices]});
// Owner-supplied non-alcoholic drinks. Product photos will be added from the owner's web folder.
const softDrinks=[
 [278,'Moloko Mango 0,25 l',399,'0,25 l · 15,96 €/l'],
 [279,'Cranberry-Moloko 0,25 l',374,'zzgl. Pfand (0,25 €) · 0,25 l · 14,96 €/l'],
 [280,'Softdrink-Moloko 0,25 l',399,'0,25 l · 15,96 €/l'],
 [281,'Red Bull Energy Drink 0,25 l',389,'0,25 l · 15,56 €/l'],
 [282,'Red Bull The White Edition 0,25 l',364,'zzgl. Pfand (0,25 €) · 0,25 l · 14,56 €/l'],
 [283,'Coca-Cola 0,33 l',249,'0,33 l'],
 [284,'Coca-Cola Zero Sugar 0,33 l',249,'0,33 l'],
 [285,'Fanta Orange 0,33 l',249,'0,33 l'],
 [286,'Mezzo Mix 0,33 l',249,'0,33 l'],
 [287,'Sprite 0,33 l',249,'0,33 l'],
 [288,'Krombacher Alkoholfrei 0,33 l',359,'0,33 l · 10,88 €/l'],
 [289,'Krombacher Maracuja 0,33 l',359,'0,33 l · 10,88 €/l'],
 [290,'Krombacher Zitrone 0,33 l',359,'0,33 l · 10,88 €/l'],
 [291,'Krombacher Cola-Orange 0,33 l',359,'0,33 l · 10,88 €/l'],
 [292,'Krombacher Rhabarber 0,33 l',359,'zzgl. Pfand (0,25 €) · 0,33 l'],
 [293,'Krombacher Schwarze Johannisbeere 0,33 l',359,'0,33 l · 10,88 €/l'],
 [294,'Coca-Cola 1,0 l',349,'1 l · 3,49 €/l'],
 [295,'Fuze Tea Pfirsich 0,4 l',324,'zzgl. Pfand (0,25 €) · 0,4 l'],
 [296,'Fuze Tea Zitrone-Zitronengras Zero 0,4 l',324,'zzgl. Pfand (0,25 €) · 0,4 l'],
 [297,'Stilles Wasser 0,5 l',175,'zzgl. Pfand (0,25 €) · 0,5 l · 3,50 €/l'],
 [298,'Wasser mit Kohlensäure 0,5 l',175,'zzgl. Pfand (0,25 €) · 0,5 l · 3,50 €/l'],
 [299,'ESN Designer Whey Protein – Cinnamon Cereal',349,'Portionsbeutel · 30 g · Molkenprotein-Mix mit Cereal-Stückchen.'],
 [300,'ESN Isoclear Whey Isolate – Peach Iced Tea',349,'Portionsbeutel · 30 g · laktosefrei, zuckerfrei und fettfrei.'],
 [301,'Fanta Lemon & Elderflower 0,33 l',0,'zzgl. Pfand (0,25 €) · 0,33 l',true],
 [302,'Fanta Strawberry & Kiwi 0,33 l',0,'zzgl. Pfand (0,25 €) · 0,33 l',true],
 [303,'Fresh Cannabis Ice Tea THC Free 0,5 l',0,'zzgl. Pfand (0,15 €) · 0,5 l',true],
 [304,'Moloko Blueberry 0,25 l',0,'0,25 l · 15,96 €/l',true],
 [305,'Fanta Mango & Dragonfruit 0,33 l',0,'zzgl. Pfand (0,25 €) · 0,33 l',true]
];
for(const [id,n,cents,d,unavailable=false] of softDrinks)catalog.push({id,n,cents,p:cents/100,d,c:'Alkoholfreie Getränke',img:null,unavailable,verified:true,optionsPending:false});
