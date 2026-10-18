#!/usr/bin/env python3
"""Baut menu-translations.json: Entwürfe (status=draft) für Englisch + Arabisch (Schami) aus den Produktdaten.
Regeln: Produktnamen bleiben lateinisch (Marken/erfundene Namen) – nur deutsche Allgemeinnamen werden übersetzt;
Beschreibungen werden vollständig übersetzt. Schlüssel = sourceId (stabil, auch wenn Namen geändert werden).
Aufruf: python3 scripts/build-menu-translations.py   (liest data/nara-admin.json bzw. menu-source.js-Export, schreibt menu-translations.json)"""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
S_EN = ' Incl. 2 dips of your choice & 1 portion of fries. The same flavour can be chosen twice. Additional dips for an extra charge.'
S_AR = ' مع 2 ديب حسب اختيارك وحصّة بطاطا. فيك تختار نفس النكهة مرتين. ديبات إضافية بسعر إضافي.'
X_EN, X_AR = 'Double tortillas and ingredients. ', 'تورتيلا ومكوّنات مضاعفة. '
D = {}
def d(sid, en, ar): D[str(sid)] = (en, ar)
d(10,'Beef, tomatoes, pickles, red onions, cheddar and Joppie sauce on a sesame brioche bun.','لحمة بقر، بندورة، مخلل، بصل أحمر، شيدر وصوص Joppie بخبز بريوش بالسمسم.')
d(11,'Chicken fillet patty, pickles, red onions, cheddar and Joppie sauce on a sesame brioche bun.','قرص فيليه دجاج، مخلل، بصل أحمر، شيدر وصوص Joppie بخبز بريوش بالسمسم.')
d(12,'Chicken breast, lettuce, pickles, red onions, cheddar and creamy burger sauce on a sesame bun.','صدر دجاج، خس، مخلل، بصل أحمر، شيدر وصوص برغر كريمي بخبز بالسمسم.')
d(2,'Beef, cheddar, lettuce, tomatoes, red onions, ketchup and mayonnaise on a sesame bun.','لحمة بقر، شيدر، خس، بندورة، بصل أحمر، كاتشب ومايونيز بخبز بالسمسم.')
d(5,'Crispy chicken breast, cheddar, lettuce, red onions, pickles, ketchup and mayonnaise on a sesame bun.','صدر دجاج كرسبي، شيدر، خس، بصل أحمر، مخلل، كاتشب ومايونيز بخبز بالسمسم.')
d(1,'Two beef patties (160 g), cheddar, lettuce and creamy mushroom burger sauce with mushroom pieces. Burger bun.','قرصين لحمة بقر (160 غ)، شيدر، خس وصوص برغر كريمي بالفطر مع قطع فطر. خبز برغر.')
d(13,'Crispy zinger chicken breast, cheddar, lettuce, pickles, red onions and spicy zinger sauce on a sesame bun.','صدر دجاج زنجر مقرمش، شيدر، خس، مخلل، بصل أحمر وصوص زنجر حار بخبز بالسمسم.')
d(14,'Three layers of beef (300 g), cheddar, lettuce, tomatoes, red onions, pickles and burger sauce.','ثلاث طبقات لحمة بقر (300 غ)، شيدر، خس، بندورة، بصل أحمر، مخلل وصوص برغر.')
d(15,'Three chicken patties, two slices of cheddar, lettuce, red onions, pickles and creamy burger sauce on a sesame bun.','ثلاث أقراص دجاج، شريحتين شيدر، خس، بصل أحمر، مخلل وصوص برغر كريمي بخبز بالسمسم.')
d(3,'Beef patty (150 g), cheddar, tomatoes, red onions, lettuce, pickles and guacamole-style sauce.','قرص لحمة بقر (150 غ)، شيدر، بندورة، بصل أحمر، خس، مخلل وصوص على طريقة الغواكامولي.')
d(16,'Beef, lettuce, tomatoes, red onions, pickles, ketchup and mayonnaise on a sesame bun.','لحمة بقر، خس، بندورة، بصل أحمر، مخلل، كاتشب ومايونيز بخبز بالسمسم.')
d(17,'Two beef patties (200 g), double cheddar, iceberg lettuce, red onions, tomatoes, pickles and Big Burger sauce.','قرصين لحمة بقر (200 غ)، شيدر مرتين، خس آيسبرغ، بصل أحمر، بندورة، مخلل وصوص Big Burger.')
d(18,'Two chicken patties, double cheddar, iceberg lettuce, red onions, pickles and Big sauce on a sesame bun.','قرصين دجاج، شيدر مرتين، خس آيسبرغ، بصل أحمر، مخلل وصوص Big بخبز بالسمسم.')
d(19,'Chicken fillet, chili cheese sauce, lettuce, jalapeños and red onions on a sesame bun.','فيليه دجاج، صوص جبنة حار، خس، هالابينو وبصل أحمر بخبز بالسمسم.')
d(20,'Beef, chili cheese sauce, tomatoes, red onions, lettuce and jalapeños. Spicy.','لحمة بقر، صوص جبنة حار، بندورة، بصل أحمر، خس وهالابينو. حار.')
d(21,'Beef, halal bacon, cheddar, lettuce, tomatoes, red onions and BBQ sauce.','لحمة بقر، بيكون حلال، شيدر، خس، بندورة، بصل أحمر وصوص باربكيو.')
d(22,'Beef patty (150 g), three shrimp, tomatoes, cheddar, lettuce, grilled onions and Original Burger sauce.','قرص لحمة بقر (150 غ)، ثلاث جمبري، بندورة، شيدر، خس، بصل مشوي وصوص Original Burger.')
d(23,'Plant-based patty, tomatoes, lettuce, red onions, pickles, mayonnaise and ketchup.','قرص نباتي، بندورة، خس، بصل أحمر، مخلل، مايونيز وكاتشب.')
d(24,'Four mini burgers with pulled chicken, BBQ sauce, lettuce, tomatoes and onions.','أربع برغر صغيرة بدجاج مفتّت، صوص باربكيو، خس، بندورة وبصل.')
d(30,'6 wings with classic sweet Korean yangnyeom glaze and toasted sesame. Mild.','6 أجنحة بجلاز يانغنيوم الكوري الكلاسيكي الحلو وسمسم محمّص. معتدل.')
d(31,'6 wings with warm cheddar cheese sauce and spicy mayo. Spicy.','6 أجنحة مع صوص جبنة شيدر دافئ وسبايسي مايو. حار.')
d(32,'6 wings with a fiery, slightly sweet Korean chili glaze and sesame. Spicy.','6 أجنحة بجلاز فلفل كوري ناري وحلو شوي مع سمسم. حار.')
d(33,'6 wings in teriyaki glaze, garnished with sesame.','6 أجنحة بجلاز تيرياكي مزيّنة بالسمسم.')
d(34,'6 wings with creamy truffle mayonnaise.','6 أجنحة مع مايونيز الترفل الكريمي.')
d(35,'6 wings in a spicy buffalo sauce.','6 أجنحة بصوص بوفالو حار.')
d(40,'12 crispy chicken wings.'+S_EN,'12 جناح دجاج مقرمش.'+S_AR)
d(41,'12 tender, extra crispy chicken tenders (boneless).'+S_EN,'12 قطعة تندرز دجاج طرية ومقرمشة جداً (بدون عظم).'+S_AR)
d(42,'6 crispy wings & 6 tender crispy tenders.'+S_EN,'6 أجنحة مقرمشة و6 قطع كريسبي تندرز طرية.'+S_AR)
d(43,'6 wings, 4 crispy tenders & 6 chicken nuggets.'+S_EN,'6 أجنحة، 4 كريسبي تندرز و6 قطع ناجتس دجاج.'+S_AR)
d(50,'16 crispy fried wings.','16 جناح مقلي مقرمش.')
d(51,'16 crispy fried nuggets.','16 قطعة ناجتس مقلية مقرمشة.')
d(52,'8 crispy chicken wings and 8 crispy nuggets.','8 أجنحة دجاج مقرمشة و8 قطع ناجتس مقرمشة.')
d(53,'Crispy chicken patty made from chicken breast, cheddar, fresh lettuce, red onions, pickles, ketchup and mayonnaise on a sesame bun.','قرص دجاج كرسبي من صدر الدجاج، شيدر، خس طازج، بصل أحمر، مخلل، كاتشب ومايونيز بخبز بالسمسم.')
d(54,'Juicy beef, cheddar, lettuce, fresh tomatoes, red onions, ketchup and mayonnaise on a sesame bun.','لحمة بقر طرية، شيدر، خس، بندورة طازجة، بصل أحمر، كاتشب ومايونيز بخبز بالسمسم.')
d(130,'1 Cheese Beef Burger, 1 Cheese Chicken Burger, 4 crispy chicken fillet pieces, a large portion of fries, 2 soft drinks of your choice and a sauce.','1 Cheese Beef Burger، 1 Cheese Chicken Burger، 4 قطع فيليه دجاج مقرمشة، حصّة بطاطا كبيرة، 2 مشروب غازي حسب اختيارك وصوص.')
d(131,'1 Cheese Beef Burger, 1 Crunchy Chicken Burger, 1 BBQ Burger, 6 crispy chicken fillets, 2 portions of fries, 3 drinks of your choice and 2 sauces. Ideal for sharing with friends.','1 Cheese Beef Burger، 1 Crunchy Chicken Burger، 1 BBQ Burger، 6 قطع فيليه دجاج مقرمشة، 2 حصّة بطاطا، 3 مشروبات حسب اختيارك و2 صوص. مثالية للمشاركة مع الأصدقاء.')
d(132,'2 Cheese Beef Burgers, 2 Crunchy Chicken Burgers, 8 crispy chicken fillets, 2 large portions of fries, 1.0 l Coca-Cola and 4 sauces. A hearty family meal to enjoy together.','2 Cheese Beef Burger، 2 Crunchy Chicken Burger، 8 قطع فيليه دجاج مقرمشة، 2 حصّة بطاطا كبيرة، 1.0 l كوكا كولا و4 صوصات. وجبة عائلية دسمة للمشاركة.')
d(133,'3 Cheese Beef Burgers, 3 Crunchy Chicken Burgers, 12 crispy chicken fillets, 4 large portions of fries, 2.0 l Coca-Cola, 6 sauces and a large coleslaw – perfect for large groups and parties.','3 Cheese Beef Burger، 3 Crunchy Chicken Burger، 12 قطعة فيليه دجاج مقرمشة، 4 حصص بطاطا كبيرة، 2.0 l كوكا كولا، 6 صوصات وسلطة كولسلو كبيرة – مثالية للمجموعات الكبيرة والحفلات.')
T = {150:('Tortillas, falafel, tahini sauce, tomatoes, lettuce, pickled beetroot and fries.','تورتيلا، فلافل، صوص طحينة، بندورة، خس، شمندر مخلل وبطاطا مقلية.'),
152:('Beef, fries, chili cheese sauce, mushrooms, corn, red onions and jalapeños. Spicy.','لحمة بقر، بطاطا مقلية، صوص جبنة حار، فطر، ذرة، بصل أحمر وهالابينو. حار.'),
6:('Tortillas, chicken strips, chili tomato sauce, fries, red onions, mushrooms, corn and cheese sauce.','تورتيلا، شرائح دجاج، صوص بندورة حار، بطاطا مقلية، بصل أحمر، فطر، ذرة وصوص جبنة.'),
155:('Tortillas, chicken strips, fries, mushrooms, red onions, corn and smoky barbecue sauce.','تورتيلا، شرائح دجاج، بطاطا مقلية، فطر، بصل أحمر، ذرة وصوص باربكيو مدخّن.'),
157:('Onions, hot dog, lettuce, mushrooms, corn and cheese sauce.','بصل، هوت دوغ، خس، فطر، ذرة وصوص جبنة.'),
159:('Tortillas, beef, chicken strips, taco sauce, red onions, cheese and fries.','تورتيلا، لحمة بقر، شرائح دجاج، صوص تاكو، بصل أحمر، جبنة وبطاطا مقلية.'),
161:('Tortillas, beef, fries, mushrooms, red onions, pickles and Joppie sauce.','تورتيلا، لحمة بقر، بطاطا مقلية، فطر، بصل أحمر، مخلل وصوص Joppie.'),
163:('Tortillas, chicken strips, fries, red onions, mushrooms, pickles and Joppie sauce.','تورتيلا، شرائح دجاج، بطاطا مقلية، بصل أحمر، فطر، مخلل وصوص Joppie.')}
for sid,(en,ar) in T.items():
    d(sid,en,ar); d(sid+1 if sid!=6 else 154,X_EN+en,X_AR+ar)
D['151']=(X_EN+T[150][0],X_AR+T[150][1])
d(165,'Tortilla, chicken, pickled cucumbers, fries and garlic cream.','تورتيلا، دجاج، مخلل خيار، بطاطا مقلية وثومية.')
d(166,'Beef shawarma, tahini, onions, pickles and parsley.','شاورما لحمة، طحينة، بصل، مخلل وبقدونس.')
for sid,en,ar in [(170,'Double portion of fries.','حصّة بطاطا مضاعفة.'),(171,'Fries with chili cheese sauce and jalapeños.','بطاطا مقلية مع صوص جبنة حار وهالابينو.'),(172,'Fries with avocado sauce.','بطاطا مقلية مع صوص أفوكادو.'),(173,'Fries with Joppie sauce.','بطاطا مقلية مع صوص Joppie.'),
(174,'Fries with chopped beef, onions and cheese sauce.','بطاطا مقلية مع لحمة بقر مقطّعة صغير، بصل وصوص جبنة.'),(175,'Fries with chopped crispy fried chicken and fries sauce.','بطاطا مقلية مع دجاج مقلي مقرمش مقطّع صغير وصوص بطاطا.'),
(176,'Round fried potato balls.','كرات بطاطا مقلية.'),(177,'Twister fries.','بطاطا تويستر.'),(178,'Fried onion rings.','حلقات بصل مقلية.'),(179,'With chili and cheddar.','بالفلفل الحار والشيدر.'),(180,'Crispy fried.','مقلية ومقرمشة.'),
(181,'Floured and fried shrimp.','جمبري مطحون بالطحين ومقلي.'),(182,'Filled with vegetables.','محشية بالخضار.'),(183,'Crispy breaded mozzarella.','موزاريلا مقرمشة بالبقسماط.'),
(184,'Mild, gently marinated chicken wings with a typical smoky barbecue note.','أجنحة دجاج معتدلة ومتبّلة بلطف بنكهة باربكيو مدخّنة.'),(185,'Juicy split chicken wings, marinated and cooked.','أجنحة دجاج طرية مقطّعة، متبّلة ومطبوخة.'),
(186,'Crispy breaded camembert.','كاممبير مقرمش بالبقسماط.'),(187,'3 crispy shrimp torpedoes, 3 chicken nuggets, 4 chicken wings, 3 cheese nuggets and 2 cheese-baked camembert.','3 جمبري تورپيدو مقرمش، 3 ناجتس دجاج، 4 أجنحة دجاج، 3 ناجتس جبنة و2 كاممبير بالجبنة.'),
(188,'Pickled vegetables.','خضار مخلل.'),(189,'Small fried chicken pieces.','قطع دجاج صغيرة مقلية.'),(190,'With cinnamon and sugar.','بالقرفة والسكر.'),(191,'Corn-on-the-cob pieces. Vegan and vegetarian.','قطع ذرة على الكوب. نباتي وخالي من اللحوم.'),
(192,'White cabbage, carrots, onions, dressing, mayonnaise, garlic, vinegar, sugar, lemon juice, salt and pepper.','ملفوف أبيض، جزر، بصل، دريسينغ، مايونيز، ثوم، خل، سكر، عصير ليمون، ملح وبهار.'),
(193,'In tomato sauce.','بصوص البندورة.'),(194,'Classic potato salad.','سلطة بطاطا كلاسيكية.'),(195,'Fresh pasta salad.','سلطة معكرونة طازجة.'),(196,'With bell pepper, corn, kidney beans, cucumbers, carrots and pearl onions.','بالفليفلة، ذرة، فاصولياء حمراء، خيار، جزر وبصل صغير.'),
(197,'With pasta, tomatoes, bell pepper, celery, white cabbage, zucchini and white balsamic.','بمعكرونة، بندورة، فليفلة، كرفس، ملفوف أبيض، كوسا وخل بلسمي أبيض.'),(198,'With parsley, sumac, tahini, pickles and lemon.','ببقدونس، سمّاق، طحينة، مخلل وليمون.'),(199,'With egg and fries.','مع بيض وبطاطا مقلية.'),
(200,'With lettuce, pickles, tomatoes, lemon, hummus and tahini.','مع خس، مخلل، بندورة، ليمون، حمص وطحينة.'),(201,'Vine leaves filled with rice, tomatoes, garlic, mint and parsley.','ورق عنب محشي برز، بندورة، ثوم، نعنع وبقدونس.'),(202,'Sesame paste with chickpeas.','حمص بطحينة.'),
(203,'Falafel sandwich or falafel sandwich extra, with a dip and a drink of your choice.','ساندويش فلافل أو ساندويش فلافل إكسترا، مع ديب ومشروب حسب اختيارك.'),
(204,'With chicken sausage, crispy fried onions, pickles, mustard, ketchup, mayonnaise and a brioche roll.','مع نقانق دجاج، بصل مقرمش، مخلل، خردل، كاتشب، مايونيز وخبز بريوش.'),(205,'With cheddar sauce, crispy fried onions and pickles.','مع صوص شيدر، بصل مقلي مقرمش ومخلل.'),
(206,'With chicken sausage, crispy fried onions, pickles, mustard, ketchup, mayonnaise and a brioche roll.','مع نقانق دجاج، بصل مقرمش، مخلل، خردل، كاتشب، مايونيز وخبز بريوش.'),(207,'With chili sauce, jalapeños and crispy fried onions.','مع صوص حار، هالابينو وبصل مقرمش.'),
(208,'With barbecue sauce, crispy fried onions and pickles.','مع صوص باربكيو، بصل مقرمش ومخلل.'),(209,'With special fries sauce, fries and pickles.','مع صوص بطاطا سبيشال، بطاطا ومخلل.'),(210,'With curry sauce and fries.','مع صوص كاري وبطاطا مقلية.'),
(211,'With chicken, pickled cucumbers and garlic cream.','مع دجاج، مخلل خيار وثومية.'),(212,'Chicken shawarma in a baguette, garlic cream and pickles.','شاورما دجاج بخبز باغيت، ثومية ومخلل.'),(213,'Beef shawarma, tahini, onions and pickles.','شاورما لحمة، طحينة، بصل ومخلل.'),
(214,'Beef shawarma in a baguette, tahini, onions, pickles and double ingredients.','شاورما لحمة بخبز باغيت، طحينة، بصل، مخلل ومكوّنات مضاعفة.'),(215,'Shawarma wrap cut up onto a plate, with chicken, pickled cucumbers and garlic cream.','لفّة شاورما مقطّعة بصحن، مع دجاج، مخلل خيار وثومية.'),
(216,'Shawarma wrap cut up onto a plate, with beef, pickled cucumbers and garlic cream.','لفّة شاورما مقطّعة بصحن، مع لحمة بقر، مخلل خيار وثومية.'),(217,'Falafel sandwich in a baguette with extra falafel balls, lettuce and sauce.','ساندويش فلافل بخبز باغيت مع أقراص فلافل إضافية، خس وصوص.'),
(218,'Beef, onions, lettuce, tomatoes, sauce, jalapeños and cheese. Spicy.','لحمة بقر، بصل، خس، بندورة، صوص، هالابينو وجبنة. حار.'),(219,'Crispy chicken fillet, mayonnaise, coleslaw, lettuce, pickles and onions in a baguette.','فيليه دجاج كرسبي، مايونيز، كولسلو، خس، مخلل وبصل بخبز باغيت.'),
(220,'200 g beef, two slices of cheese, tomatoes, pickles, lettuce, sauce, onions and pomegranate molasses.','200 غ لحمة بقر، شريحتين جبنة، بندورة، مخلل، خس، صوص، بصل ودبس رمان.'),(221,'Crunchy chicken breast, chili cheese nuggets, onions, pickles and lettuce.','صدر دجاج كرانشي، ناجتس جبنة حار، بصل، مخلل وخس.'),
(222,'Fries, mayonnaise, pickles, ketchup, cheese and coleslaw.','بطاطا مقلية، مايونيز، مخلل، كاتشب، جبنة وكولسلو.'),(223,'8 chicken fillet pieces, 1 fries, 1 coleslaw, 1 sauce and 1 non-alcoholic drink of your choice.','8 قطع فيليه دجاج، 1 بطاطا مقلية، 1 كولسلو، 1 صوص و1 مشروب بدون كحول حسب اختيارك.'),
(224,'Marinated chicken breast fillet pieces, crispy fried, including 1 sauce.','قطع فيليه صدر دجاج متبّلة، مقلية ومقرمشة، مع صوص واحد.'),(225,'Marinated chicken breast fillet pieces, crispy fried, including 1 sauce.','قطع فيليه صدر دجاج متبّلة، مقلية ومقرمشة، مع صوص واحد.'),
(226,'Chocolate-hazelnut muffin.','مافن شوكولاتة وبندق.'),(227,'Chocolate muffin.','مافن شوكولاتة.'),(228,'Blueberry muffin.','مافن توت أزرق.'),(229,'With pink glaze.','بطبقة سكر وردية.'),(230,'With caramel filling.','محشي بالكراميل.'),(231,'With chocolate glaze.','بطبقة شوكولاتة.'),(232,'With white glaze.','بطبقة سكر بيضاء.'),
(233,'Dark sponge base with chocolate cream.','قاعدة كيك داكنة مع كريمة شوكولاتة.'),(234,'Tiramisu café cake.','كيكة تيراميسو بالقهوة.'),(235,'Cheesecake.','تشيز كيك.'),(236,'Soufflé al cioccolato.','سوفليه بالشوكولاتة.'),
(264,'Creamy mayonnaise.','مايونيز كريمي.'),(265,'Classic tomato ketchup.','كاتشب بندورة كلاسيكي.'),(266,'Spicy garlic sauce.','صوص ثوم غني بالنكهة.'),(267,'Hot chili sauce.','صوص فلفل حار.'),(268,'Smoky barbecue sauce.','صوص باربكيو مدخّن.'),(269,'Hot chili cheese sauce.','صوص جبنة حار.'),(270,'Creamy cheese sauce.','صوص جبنة كريمي.'),
(271,'Mustard.','خردل.'),(272,'Flavourful Joppie sauce.','صوص Joppie غني بالنكهة.'),(273,'Fruity lemon sauce.','صوص ليمون منعش.'),(274,'Fine truffle mayonnaise.','مايونيز ترفل فاخر.'),(275,'Asian teriyaki sauce.','صوص تيرياكي آسيوي.'),(276,'Homemade sauce.','صوص من تحضير البيت.'),(277,'Creamy garlic sauce.','صوص ثوم كريمي.')]:
    d(sid,en,ar)
FR = {237:('mango','المانغا'),238:('strawberry','الفراولة'),239:('peach','الدراق'),240:('passion fruit','الباشن فروت'),241:('mocha','الموكا'),242:('white mocha','الوايت موكا'),243:('vanilla','الفانيلا'),244:('caramel','الكراميل'),245:('mango-strawberry','المانغا والفراولة'),246:('strawberry–white mocha','الفراولة والوايت موكا'),247:('strawberry-peach','الفراولة والدراق'),248:('caramel-mocha','الكراميل والموكا'),249:('strawberry-mocha','الفراولة والموكا'),250:('caramel–white mocha','الكراميل والوايت موكا'),251:('crème brûlée','الكريم بروليه')}
for sid,(en,ar) in FR.items(): d(sid,f'Refreshing {en} cream frappé.',f'فرابيه كريمي منعش بنكهة {ar}.')
d(252,'Blueberry flavour with milk of your choice.','نكهة التوت الأزرق مع حليب حسب اختيارك.')
for sid,en,ar in [(299,'Single-serve sachet · 30 g · whey protein mix with cereal pieces.','كيس حصّة واحدة · 30 g · خليط بروتين مصل اللبن مع قطع سيريال.'),(300,'Single-serve sachet · 30 g · lactose-free, sugar-free and fat-free.','كيس حصّة واحدة · 30 g · خالٍ من اللاكتوز والسكر والدهون.'),
(500,'Espresso + cold milk + ice','إسبريسو + حليب بارد + ثلج'),(501,'Espresso + cold milk + caramel syrup + ice','إسبريسو + حليب بارد + شراب كراميل + ثلج'),(502,'Espresso + sweetened condensed milk + cold milk + ice','إسبريسو + حليب مكثّف محلّى + حليب بارد + ثلج'),(503,'Espresso + cold milk + vanilla syrup + ice','إسبريسو + حليب بارد + شراب فانيلا + ثلج'),
(504,'Cold milk + chocolate syrup + ice','حليب بارد + شراب شوكولاتة + ثلج'),(505,'Espresso + hazelnut syrup + cold milk + ice','إسبريسو + شراب بندق + حليب بارد + ثلج'),(506,'Freshly brewed coffee, chilled and served over ice','قهوة طازجة، مبرّدة ومقدّمة على الثلج'),(507,'Espresso + cold, creamy milk + ice','إسبريسو + حليب بارد كريمي + ثلج'),(508,'Espresso + cold milk + mocha syrup + ice','إسبريسو + حليب بارد + شراب موكا + ثلج')]:
    d(sid,en,ar)
SH = {510:('passion fruit','الباشن فروت'),511:('strawberry','الفراولة'),512:('peach','الدراق'),513:('raspberry','التوت العليق'),514:('mango','المانغا'),515:('lemon','الليمون'),516:('piña colada','البينا كولادا'),517:('tropical mix','المكس الاستوائي')}
for sid,(en,ar) in SH.items(): d(sid,f'Iced green tea shaken with {en}',f'شاي أخضر مثلّج مخفوق مع {ar}')
NAMES = {'Mini-Frühlingsrollen':('Mini spring rolls','ميني سبرينغ رول'),'Gemüse Sauer Eingelegt':('Pickled vegetables','خضار مخلل'),'Mais Kolben Stücken':('Corn-on-the-cob pieces','قطع ذرة'),'Weiße Riesenbohnen':('Giant white beans','فاصولياء بيضاء كبيرة'),'Kartoffelsalat':('Potato salad','سلطة بطاطا'),'Nudelsalat':('Noodle salad','سلطة نودلز'),'Mexiko Salat':('Mexican salad','سلطة مكسيكية'),'Pasta Salat':('Pasta salad','سلطة باستا'),
'Currywurst mit Pommes Frites':('Currywurst with fries','كوريفورست مع بطاطا مقلية'),'Falafel Teller':('Falafel plate','صحن فلافل'),'Falafel-Menü':('Falafel meal','وجبة فلافل'),'Shawarma Rolle im Tortilla Brot':('Shawarma wrap in tortilla bread','لفّة شاورما بخبز تورتيلا'),'Shawarma doppelt':('Double shawarma','شاورما دبل'),
'Shawarma (Fleisch) Rolle im Tortilla Brot':('Beef shawarma wrap in tortilla bread','لفّة شاورما لحمة بخبز تورتيلا'),'Shawarma doppelt (Fleisch)':('Double beef shawarma','شاورما لحمة دبل'),'Shawarma Arabi Platte':('Shawarma Arabi plate','صحن شاورما عربي'),'Shawarma Fleisch Arabi Platte':('Beef shawarma Arabi plate','صحن شاورما لحمة عربي'),
'Shawarma tacos Hähnchenfleisch':('Chicken shawarma tacos','تاكو شاورما دجاج'),'Shawarma tacos (Fleisch)':('Beef shawarma tacos','تاكو شاورما لحمة'),'Falafel doppelt (vegan)':('Double falafel (vegan)','فلافل دبل (نباتي)'),'Hähnchen Crispy Filet Sandwich':('Crispy chicken fillet sandwich','ساندويش فيليه دجاج كرسبي'),'Pommes Sandwich':('Fries sandwich','ساندويش بطاطا'),
'Crispy Chicken Filet Menü':('Crispy chicken fillet meal','وجبة فيليه دجاج كرسبي'),'Churrito Zimt & Zucker (5 Stück)':('Churrito cinnamon & sugar (5 pieces)','تشوريتو بالقرفة والسكر (5 قطع)'),'Cheese Back-Camembert (3 Stück)':('Cheese-baked camembert (3 pieces)','كاممبير بالجبنة (3 قطع)'),
'Haus Sauce':('House sauce','صوص البيت'),'Senf':('Mustard','خردل'),'Chili-Scharf Sauce':('Hot chili sauce','صوص فلفل حار'),'Barbecuesauce':('Barbecue sauce','صوص باربكيو'),'Chillicheese Sauce':('Chili cheese sauce','صوص جبنة حار'),
'Stilles Wasser 0,5 l':('Still water 0.5 l','مياه عادية 0.5 l'),'Wasser mit Kohlensäure 0,5 l':('Sparkling water 0.5 l','مياه غازية 0.5 l'),'Krombacher Alkoholfrei 0,33 l':('Krombacher non-alcoholic 0.33 l','Krombacher بدون كحول 0.33 l'),'Krombacher Maracuja 0,33 l':('Krombacher passion fruit 0.33 l','Krombacher باشن فروت 0.33 l'),
'Krombacher Zitrone 0,33 l':('Krombacher lemon 0.33 l','Krombacher ليمون 0.33 l'),'Krombacher Rhabarber 0,33 l':('Krombacher rhubarb 0.33 l','Krombacher راوند 0.33 l'),'Krombacher Schwarze Johannisbeere 0,33 l':('Krombacher blackcurrant 0.33 l','Krombacher كشمش أسود 0.33 l'),
'Fuze Tea Pfirsich 0,4 l':('Fuze Tea peach 0.4 l','Fuze Tea دراق 0.4 l'),'Fuze Tea Zitrone-Zitronengras Zero 0,4 l':('Fuze Tea lemon-lemongrass Zero 0.4 l','Fuze Tea ليمون وعشبة الليمون Zero 0.4 l'),
'Iced Spanischer Latte':('Iced Spanish Latte','Iced Spanish Latte'),'Iced Haselnuss Coffee':('Iced Hazelnut Coffee','Iced Hazelnut Coffee'),'Schokoladen Black-Donut':('Chocolate Black Donut','دونات شوكولاتة بلاك'),'Crispy Caramel-gefüllte Donut':('Crispy caramel-filled donut','دونات كراميل مقرمش محشي')}
CATS = {'Alkoholfreie Getränke':('Soft drinks (non-alcoholic)','مشروبات غير كحولية'),'Salate':('Salads','سلطات'),'Angebot':('Offers','عروض'),'Angebot 3 für 2':('3-for-2 offers','عروض 3 بسعر 2'),'Dips':('Dips','ديبات'),'Desserts':('Desserts','حلويات'),'Sandwiches':('Sandwiches','ساندويشات'),'Hot Dogs':('Hot dogs','هوت دوغ'),'Falafel':('Falafel','فلافل'),'Fried Chicken':('Fried chicken','دجاج مقلي'),'Iced Coffee':('Iced coffee','قهوة مثلّجة'),'Iced Tea':('Iced tea','شاي مثلّج'),'Beef Burger':('Beef burger','برغر لحمة'),'Chicken Burger':('Chicken burger','برغر دجاج'),'Veggie Burger':('Veggie burger','برغر نباتي'),'Specials':('Specials','سبيشال')}
def name_tr(nm):
    if nm in NAMES: return NAMES[nm]
    en, ar = nm, nm
    if 'Stück' in nm:
        en = re.sub(r'Stück(en)?', 'pieces', nm).replace('sehr scharf','very spicy'); ar = re.sub(r'(\d+)(\)| Stück)', lambda m: m.group(0), nm); ar = re.sub(r'(\d+) Stück(en)?', lambda m: m.group(1)+(' قطع' if int(m.group(1))<=10 else ' قطعة'), nm).replace('sehr scharf','حار جداً')
    en = en.replace('(scharf)','(spicy)').replace('(Scharf)','(spicy)'); ar = ar.replace('(scharf)','(حار)').replace('(Scharf)','(حار)')
    return en, ar
def desc_tr(ds, sid):
    if sid in D: return D[sid]
    m = re.fullmatch(r'(?:zzgl\. Pfand \(([\d,]+) €\) · )?(.*)', ds)
    if m and re.search(r'\d', ds) and not re.search('[A-Za-z]{4}', re.sub(r'zzgl\. Pfand|€/l', '', ds)):
        dep = m.group(1); rest = m.group(2)
        pre_en = f'plus {dep} € deposit · ' if dep else ''; pre_ar = f'+ وديعة {dep} € · ' if dep else ''
        dot=lambda t: re.sub(r'(\d),(\d)', r'\1.\2', t)
        return (dot(pre_en + rest), dot(pre_ar + rest))
    return (ds, ds)
if __name__ == '__main__':
    d0 = json.loads((root/'data'/'nara-admin.json').read_text(encoding='utf8'))
    out = {'_info': 'Entwürfe (draft). Schlüssel = sourceId. In der Menüverwaltung → Übersetzungen prüfen und freigeben.', 'products': {}, 'categories': {}}
    missing = []
    for p in d0['products']:
        sid = str(p['sourceId']); en, ar = desc_tr(p.get('description', ''), sid)
        if sid not in D and re.search('[äöüß]|\\b(und|mit|Mit)\\b', p.get('description','')) : missing.append((sid, p['name'], p['description']))
        ne, na = name_tr(p['name'])
        out['products'][sid] = {'name': {'en': ne, 'ar': na}, 'description': {'en': en, 'ar': ar}}
    for c in d0['categories']:
        ce, ca = CATS.get(c['name'], (c['name'], c['name'])); out['categories'][c['name']] = {'en': ce, 'ar': ca}
    (root/'menu-translations.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf8')
    print(len(out['products']), 'Produkte;', len(missing), 'ohne Übersetzung'); [print(m) for m in missing]
