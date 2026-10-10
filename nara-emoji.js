/* nara-emoji.js — kleine Emojis an der richtigen Stelle (nur Bildschirm, nie auf dem Bon).
 * cat(name)  → Kategorie mit Emoji ("🍔 Beef Burger")
 * deco(text) → Zutat/Option mit Emoji ("🧀 Cheddar"), oder unverändert wenn nichts passt
 * Regel: lieber kein Emoji als ein falsches. Reihenfolge der Regeln ist wichtig.
 */
(function (root) {
  'use strict';
  var CAT = [
    [/veggie|vegan/i, '🥦'], [/burger-?men/i, '🍽️'], [/burger|bundel|bundle|combo/i, '🍔'],
    [/wings|bucket|fried chicken|chicken/i, '🍗'], [/angebot|deal|3 für 2/i, '🏷️'],
    [/taco/i, '🌯'], [/special/i, '⭐'], [/salat|salad/i, '🥗'], [/falafel/i, '🧆'],
    [/hot ?dog/i, '🌭'], [/sandwich|shawarma/i, '🥪'], [/dessert|süß|sweet/i, '🍰'],
    [/dip|sauce|soße/i, '🫙'], [/frapp/i, '🥤'], [/iced coffee|kaffee|coffee/i, '🧋'],
    [/iced tea|tea|tee/i, '🍹'], [/getränk|drink/i, '🥤'], [/extra/i, '✨']
  ];
  var ING = [
    [/^(ohne|kein|keine|no )|^__none/i, '🚫'],
    [/red bull|energy/i, '⚡'], [/wasser|water/i, '💧'],
    [/krombacher|bier|beer|malz/i, '🍺'],
    [/\bcola\b|coca|fanta|sprite|mezzo|softdrink|moloko|fuze|\blimo|spezi|getränk/i, '🥤'],
    [/donut/i, '🍩'], [/muffin|cupcake/i, '🧁'], [/honig|honey/i, '🍯'], [/kirsch|cherry/i, '🍒'], [/\bbun\b|brot|brötchen/i, '🍞'],
    [/protein|whey/i, '💪'],
    [/kaffee|coffee|espresso|latte|cappuccino|americano/i, '☕'],
    [/mocha|mokka|schoko|choco|brownie|nougat/i, '🍫'],
    [/\btee\b|\btea\b/i, '🍵'],
    [/garnele|shrimp|surf/i, '🍤'],
    [/bacon/i, '🥓'],
    [/cheddar|käse|kaese|cheese|chester|mozzarella|camembert/i, '🧀'],
    [/jalape|chili|chilli|scharf|spicy|hot\b|zinger|buffalo/i, '🌶️'],
    [/trüffel|truffle|pilz|champignon|mushroom/i, '🍄'],
    [/avocado|guacamole/i, '🥑'],
    [/knoblauch|garlic|aioli/i, '🧄'],
    [/zwiebel|onion/i, '🧅'],
    [/tomate|tomato|ketchup/i, '🍅'],
    [/gurke|pickle/i, '🥒'],
    [/eisberg|salat\b|lettuce/i, '🥬'],
    [/\bmais\b|corn/i, '🌽'],
    [/\bei\b|\beier\b|\begg/i, '🥚'],
    [/pommes|fries|twister|potato|kartoffel|wedges/i, '🍟'],
    [/falafel|hummus/i, '🧆'],
    [/chicken|hähnchen|haehnchen|nugget|wing|tender|pollo/i, '🍗'],
    [/patty|beef|rind|fleisch|smash/i, '🥩'],
    [/mango/i, '🥭'], [/erdbeer|strawberry/i, '🍓'], [/pfirsich|peach/i, '🍑'],
    [/zitrone|lemon/i, '🍋'], [/himbeer|raspberry|cranberry|johannisbeer/i, '🍇'],
    [/blueberry|blaubeer/i, '🫐'], [/ananas|pina|piña/i, '🍍'], [/maracuja|passion|tropical/i, '🌺'],
    [/vanill/i, '🍦'], [/karamell|caramel|brûlée|brulee/i, '🍮'], [/haselnuss|hazelnut/i, '🌰'],
    [/milch|milk|sahne|cream/i, '🥛'],
    [/bbq|barbecue|teriyaki|joppie|senf|mustard|mayo|sauce|soße|dip|dressing/i, '🫙']
  ];
  var START = /^[←-⯿☀-➿\uD83C-\uDBFF]/;
  function pick(list, text) {
    var s = String(text == null ? '' : text);
    for (var i = 0; i < list.length; i++) if (list[i][0].test(s)) return list[i][1];
    return '';
  }
  function deco(text) {
    var s = String(text == null ? '' : text);
    if (!s || START.test(s)) return s;
    var e = pick(ING, s);
    return e ? e + ' ' + s : s;
  }
  function cat(name) {
    var s = String(name == null ? '' : name);
    if (!s || START.test(s)) return s;
    var e = pick(CAT, s);
    return e ? e + ' ' + s : s;
  }
  var api = { deco: deco, cat: cat, ing: function (t) { return pick(ING, t); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NARA_EMOJI = api;
})(typeof window !== 'undefined' ? window : globalThis);
