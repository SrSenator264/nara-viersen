import json
menu=open('menu.json',encoding='utf-8').read()
base=open('base.css',encoding='utf-8').read()
app=open('nara-emoji.js',encoding='utf-8').read()+'\n'+open('app.js',encoding='utf-8').read()
ON=open('optnames.json',encoding='utf-8').read()
GUIDE='<style>'+open('guide.css',encoding='utf-8').read()+'</style><script>'+open('guide.js',encoding='utf-8').read()+'</script>'
FONTS={'C':'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Cairo:wght@500;800;900','A':'family=Anton&family=Archivo:wght@400;600;800&family=Cairo:wght@500;800;900','B':'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Cairo:wght@500;800;900'}
CSS={'A':"""
/* A · Die Halle: dark food hall, every section a numbered stand with its own colour */
:root{--bg:#141210;--fg:#F3EBDD;--topbg:#141210;--topfg:#F3EBDD;--line:#4A4540;--line2:#E3DACB;--card:#F3EBDD;--cardfg:#141210;--cta:#FFB000;--ctaink:#141210;--focus:#FFB000;
--display:'Anton','Arial Narrow',Impact,sans-serif;--body:'Archivo',system-ui,sans-serif;--ar:'Cairo','Archivo',sans-serif;--dw:400;--r:20px;--brandls:1px;--cardborder:0;color-scheme:dark}
html[dir=rtl]{--display:'Cairo','Anton',sans-serif;--dw:900}
.top{border-bottom:1px solid #2C2824}
.chip{background:transparent;border:1.5px solid var(--line);color:var(--fg)}
.chip.on,.chip:hover{background:var(--c);color:var(--ink);border-color:var(--c)}
.hero h1{font-size:clamp(64px,10vw,140px);line-height:.9;text-transform:uppercase}
.hero h1 em{font-style:normal;color:var(--cta)}
.secs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding-block:0 56px;padding-inline:max(16px,calc((100% - 1320px)/2))}
.sec{border-radius:26px;padding:22px;min-height:260px;justify-content:space-between;gap:8px}
.sec .num{font-family:'Anton',sans-serif;letter-spacing:.12em;font-size:15px}
.sec .name{font-size:clamp(40px,4.4vw,60px);text-transform:uppercase;margin-top:auto}
.sec .num{margin-bottom:auto}
.sec img{position:absolute;inset-inline-end:-10px;inset-block-start:22px;width:52%;filter:drop-shadow(0 18px 18px rgba(0,0,0,.35))}
.sec-burger{grid-column:span 2;grid-row:span 2;min-height:540px}
.sec-burger .name{font-size:clamp(70px,9vw,124px)}
.sec-burger img{width:74%;inset-block-start:90px}
.sec-sides,.sec-sweet{grid-column:span 2;min-height:200px}
.sec-sides img{width:34%}
.shero h1{text-transform:uppercase}
.card{box-shadow:0 1px 0 rgba(0,0,0,.2)}
@media (max-width:900px){.secs{grid-template-columns:repeat(2,minmax(0,1fr))}.sec-burger{grid-column:span 2;grid-row:auto;min-height:380px}.sec-sides,.sec-sweet{grid-column:span 2}}
@media (max-width:520px){.sec{min-height:200px}.sec .name{font-size:36px}.sec img{width:52%}}
""",'B':"""
/* B · Farbfelder: every section is a full-bleed colour field with huge type; mascot leads */
:root{--bg:#FFF4E2;--fg:#111;--topbg:#111;--topfg:#fff;--line:#555;--line2:#E8DCC8;--card:#fff;--cardfg:#111;--cta:#111;--ctaink:#fff;--focus:#2563EB;
--display:'Bricolage Grotesque',system-ui,sans-serif;--body:'Bricolage Grotesque',system-ui,sans-serif;--ar:'Cairo',system-ui,sans-serif;--dw:800;--r:22px;--brandls:-1px;--cardborder:0}
html[dir=rtl]{--display:'Cairo',sans-serif;--dw:900}
.chip{background:var(--c);color:var(--ink)}
.chip.on{box-shadow:inset 0 0 0 3px #fff}
.cartbtn{background:#fff;color:#111}.cartbtn b{background:#111;color:#fff}
.hero h1{font-size:clamp(64px,11vw,150px);line-height:.86;letter-spacing:-.04em}
html[dir=rtl] .hero h1{letter-spacing:0;line-height:1.1}
.secs{display:flex;flex-direction:column}
.sec{min-height:240px;padding-block:24px;padding-inline:max(16px,calc((100% - 1320px)/2));justify-content:center}
.sec .num{display:none}
.sec .name{font-size:clamp(76px,15vw,230px);letter-spacing:-.05em;position:relative;z-index:1}
html[dir=rtl] .sec .name{letter-spacing:0;line-height:1.15}
.sec .sub{position:relative;z-index:1}
.sec img{position:absolute;inset-block-start:50%;transform:translateY(-50%);inset-inline-end:max(16px,calc((100% - 1320px)/2));height:115%;max-height:340px;filter:drop-shadow(0 22px 22px rgba(0,0,0,.35))}
.sec:nth-child(even){align-items:flex-end;text-align:end}
.sec:nth-child(even) img{inset-inline-end:auto;inset-inline-start:max(16px,calc((100% - 1320px)/2))}
.sec-drinks img{height:130%}
.shero{min-height:300px}
.shero h1{letter-spacing:-.05em}
html[dir=rtl] .shero h1{letter-spacing:0;line-height:1.1}
.shero-m{position:static;margin-inline-start:auto;align-self:flex-end;margin-block-end:-6px}
.shero-m .mascot{width:clamp(150px,22vw,250px)}
.card{border-radius:24px;box-shadow:0 2px 0 rgba(0,0,0,.08)}
.add{background:var(--cta)}
body[data-route=burger] .add{background:#E3262F}
body[data-route=crispy] .add{background:#C98F00}
body[data-route=street] .add{background:#E85A0C}
body[data-route=orient] .add{background:#55652A}
body[data-route=drinks] .add{background:#1E7FA8}
body[data-route=sweet] .add{background:#C8487A}
@media (max-width:700px){.sec{min-height:180px}.sec img{height:90%;opacity:.95}.shero-in{flex-basis:55%}.shero-m .mascot{width:140px}}
"""}
CSS['C']=CSS['B']+"""
/* C · Halle in Farbe: dark food hall, every stand a big colour field with huge type */
:root{--bg:#0E0C0A;--fg:#F5EFE6;--topbg:#0E0C0A;--topfg:#F5EFE6;--line:#3A3631;--line2:#E8DCC8;--card:#FFF8EE;--cardfg:#111;--cta:#FF6A1F;--ctaink:#111;color-scheme:dark}
.top{border-bottom:1px solid #26221E}
.cartbtn{background:#FF6A1F;color:#111}.cartbtn b{background:#111;color:#fff}
.hero h1 em{font-style:normal;color:#FF6A1F}
.secs{gap:12px;padding-inline:max(12px,calc((100% - 1344px)/2));padding-block:0 48px}
.sec{border-radius:28px;padding-inline:clamp(20px,4vw,48px)}
.sec .num{display:inline-flex;align-self:flex-start;font-family:var(--body);font-weight:800;font-size:13px;letter-spacing:.14em;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.18);color:inherit;margin-bottom:6px}
.sec:nth-child(even) .num{align-self:flex-end}
.sec img{inset-inline-end:clamp(20px,4vw,48px)}
.sec:nth-child(even) img{inset-inline-start:clamp(20px,4vw,48px)}
.menu{color:var(--fg)}
.menu h2,.menu h3{color:var(--fg)}
@media (max-width:700px){.secs{gap:10px}.sec{border-radius:22px}.sec .num{font-size:11px}}
"""
THEME={'C':{'brandHtml':'iu gene<span style="color:#FF6A1F">.</span>','heroMascot':False,'guide':True,'num':'stand','text':{'h1':{'de':'Eine Halle.<br><em>Sieben</em> Stände.','en':'One hall.<br><em>Seven</em> stands.','ar':'محل واحد.<br><em>سبع</em> زوايا.'},'lede':{'de':'Burger, Crispy, Street, Orientalisch, Drinks und Desserts. Such dir an jedem Stand was aus, alles landet in einem Warenkorb.','en':'Burgers, crispy chicken, street food, oriental, drinks and desserts. Pick from every stand, it all goes into one cart.','ar':'برغر، كرسبي، ستريت فود، أكل شرقي، مشروبات وحلويات. اختار من كل زاوية، وكلو بسلة وحدة.'}}},'A':{'brandHtml':'iu gene','heroMascot':False,'guide':True,'num':'stand','text':{'h1':{'de':'Eine Halle.<br><em>Sieben</em> Stände.','en':'One hall.<br><em>Seven</em> stands.','ar':'محل واحد.<br><em>سبع</em> زوايا.'},'lede':{'de':'Burger, Crispy, Street, Orientalisch, Drinks und Desserts. Such dir an jedem Stand was aus, alles landet in einem Warenkorb.','en':'Burgers, crispy chicken, street food, oriental, drinks and desserts. Pick from every stand, it all goes into one cart.','ar':'برغر، كرسبي، ستريت فود، أكل شرقي، مشروبات وحلويات. اختار من كل زاوية، وكلو بسلة وحدة.'}}},
'B':{'brandHtml':'iu gene<span style="color:#FF3B30">.</span>','heroMascot':False,'guide':True,'num':'none','text':{'h1':{'de':'Hunger?<br>Such dir eine Farbe aus.','en':'Hungry?<br>Pick a colour.','ar':'جوعان؟<br>اختار لون.'},'lede':{'de':'Jede Farbe ist eine Ecke voller Essen. Alles kommt in einen Warenkorb, abholen oder liefern lassen.','en':'Every colour is a corner full of food. It all goes into one cart, pickup or delivery.','ar':'كل لون زاوية مليانة أكل. كلو بسلة وحدة، استلام أو توصيل.'}}}}
TITLE={'C':'Halle in Farbe','A':'Die Halle Prototyp','B':'Farbfelder Prototyp'}
for k in 'ABC':
  th=THEME[k]
  numjs="function(i){return 'STAND '+String(i+1).padStart(2,'0')}" if th['num']=='stand' else "function(){return ''}"
  themejs="window.__THEME__={brandHtml:%s,heroMascot:%s,guide:%s,numLabel:%s,text:%s};"%(json.dumps(th['brandHtml']),'true' if th['heroMascot'] else 'false','true' if th.get('guide') else 'false',numjs,json.dumps(th['text'],ensure_ascii=False))
  html=f"""<meta charset="utf-8"><title>{TITLE[k]}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="{'#141210' if k=='A' else '#0E0C0A' if k=='C' else '#111111'}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{FONTS[k]}&display=swap">
<style>{CSS[k].split('/*')[0]}{CSS[k]}{base}</style>
<div id="app"></div>
<script>window.__MENU__={menu};window.__ON__={ON};{themejs}</script>
<script>{app}</script>{GUIDE}
"""
  # put theme tokens before base so base uses them; theme overrides after base
  tokens,rest=CSS[k].split('\n.top',1) if '\n.top' in CSS[k] else (CSS[k],'')
  html=html.replace('<style>'+CSS[k].split('/*')[0]+CSS[k]+base+'</style>','<style>'+base+CSS[k]+'</style>')
  open(f'{k.lower()}.html','w',encoding='utf-8').write(html)
  print(k,len(html))
