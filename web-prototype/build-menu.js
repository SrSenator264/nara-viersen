const fs=require('fs'),vm=require('vm');
const R='/home/claude/nara-viersen/',S=process.argv[2];
const ctx={console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(R+'catalog.js','utf8').replace(/^const catalog/m,'var catalog')+'\n'+fs.readFileSync(R+'menu-source.js','utf8').replace(/\bconst (\w+)=/g,'var $1='),ctx);
const k=fs.readFileSync(R+'kasse.js','utf8');
const on=k.match(/const optionNames=(\{[\s\S]*?\});\n/)[1];
const gsrc=k.match(/function groups\(p\)\{[\s\S]*?\}function apply\(\)/)[0].replace(/function apply\(\)$/,'');
vm.runInContext('var optionNames='+on+';'+gsrc+';var G=groups;',ctx);
const old=JSON.parse(fs.readFileSync(S+'/site/menu.json','utf8'));
const byId=Object.fromEntries(ctx.catalog.map(p=>[p.id,p]));
const drop=new Set(ctx.catalog.filter(p=>p.hidden||p.unavailable===true).map(p=>p.id));
const {execSync}=require('child_process');
for(const m of old){const p=byId[m.id];if(!p)continue;
 if(p.menuImage){const src=R+'dist/client/'+p.menuImage,dst=S+'/site/t/m'+p.id+'.webp';if(fs.existsSync(src)){if(!fs.existsSync(dst))execSync('python3 -c "from PIL import Image;im=Image.open(\''+src+'\').convert(\'RGB\');im.thumbnail((420,420));im.save(\''+dst+'\',quality=72)"');m.mi='t/m'+p.id+'.webp'}}
 const gs=ctx.G(p)||[];
 m.o=gs.map(g=>({g:g.group,r:!!g.required,x:g.options.map(o=>({i:String(o.id||o.name),n:o.name,c:+o.cents||0}))})).filter(g=>g.x.length);
 if(p.conditionalGroups)m.cg=p.conditionalGroups;if(p.menuCents)m.mc=p.menuCents;if(p.menuDescription)m.md=p.menuDescription;
}
const kept=old.filter(m=>!drop.has(m.id));console.log('dropped',old.length-kept.length);fs.writeFileSync(S+'/site/menu.json',JSON.stringify(kept));
fs.writeFileSync(S+'/site/optnames.json',on.replace(/^/,''));
const withO=old.filter(m=>m.o&&m.o.length).length;console.log('products',old.length,'with options',withO,'menu',old.filter(m=>m.mc).length,'size',fs.statSync(S+'/site/menu.json').size);
const ex=old.find(m=>m.id===1);console.log(JSON.stringify(ex.o.map(g=>[g.g,g.r,g.x.length])),ex.mc);
const ex2=old.find(m=>m.id===40);console.log(JSON.stringify(ex2.o.map(g=>[g.g,g.r,g.x.length])));
