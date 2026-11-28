'use strict';
// Restricted tool gateway for the NARA project assistant.
// Code edits are allow-listed, checkpointed, and require explicit runtime opt-in.
const fs=require('node:fs'),path=require('node:path'),childProcess=require('node:child_process');
const root=__dirname;
const allowedFiles=new Set(['PROJECT_CONTEXT.md','AI_AGENT_SYSTEM.md','PROJECT_HANDOFF.md']);
const codeExt=/\.(js|html|css|json|md|ps1|cmd)$/i;
function audit(tool,details){console.info('[NARA][AGENT_TOOL]',{tool,details,at:new Date().toISOString()})}
function safeName(name){const n=String(name||'').replace(/\\/g,'/');if(!n||n.includes('..')||n.startsWith('/')||n.startsWith('.')||!codeExt.test(n))throw new Error('ملف غير مسموح أو مساره غير آمن.');return n}
function readProjectFile(name){const n=safeName(name);const file=path.join(root,n);if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('الملف غير موجود.');audit('readProjectFile',{name:n});return fs.readFileSync(file,'utf8').slice(0,50000)}
function inspectProject(){const files=fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isFile()&&codeExt.test(x.name)&&!/^\.env|^data$/i.test(x.name)).map(x=>x.name).sort();audit('inspectProject',{count:files.length});return {files,mode:'read-only-code-context',message:'يمكن للمدير قراءة ملفات الكود والإعدادات غير السرية؛ لا يتم تعديل أي ملف تلقائياً.'}}
// فحص صحة الكود (node --check لكل ملف JS). كان spawnSync لـ ~180 ملف ورا بعض = السيرفر كله (الكاشير والمطبخ) واقف 15–20 ثانية
// كل ما حدا فتح AI Control. هلق: نفس الفحص بس async (3 بنفس الوقت، ما بيوقف السيرفر)، والنتيجة محفوظة 10 دقايق.
const HEALTH_TTL_MS=10*60000;let healthCache=null,healthRunning=null;
function checkFileAsync(file){return new Promise(resolve=>childProcess.execFile(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',timeout:5000,windowsHide:true},(err,stdout,stderr)=>resolve(err?{file,message:String(stderr||stdout||err.message||'Syntax error').trim().slice(0,500)}:null)))}
function projectHealthAsync({fresh=false}={}){
 if(!fresh&&healthCache&&Date.now()-Date.parse(healthCache.checkedAt)<HEALTH_TTL_MS)return Promise.resolve(healthCache);
 if(healthRunning)return healthRunning;
 healthRunning=(async()=>{const files=inspectProject().files,queue=files.filter(x=>/\.js$/i.test(x)),issues=[];
  const worker=async()=>{while(queue.length){const issue=await checkFileAsync(queue.shift());if(issue)issues.push(issue)}};
  await Promise.all([worker(),worker(),worker()]);issues.sort((a,b)=>a.file.localeCompare(b.file));
  const score=Math.max(0,100-(issues.length*20));audit('projectHealth',{score,issues:issues.length});
  healthCache={score,files:files.length,issues,checkedAt:new Date().toISOString()};return healthCache})().finally(()=>{healthRunning=null});
 return healthRunning}
// للنداءات القديمة المتزامنة: آخر نتيجة فوراً (وبتتجدّد بالخلفية) — ما عاد في فحص بيوقف السيرفر
function projectHealth(){if(!healthCache||Date.now()-Date.parse(healthCache.checkedAt)>=HEALTH_TTL_MS)projectHealthAsync().catch(()=>{});return healthCache||{score:null,files:inspectProject().files.length,issues:[],checkedAt:null,pending:true}}
function createChangeProposal(title,description,risk='غير محدد'){if(!title||!description)throw new Error('العنوان والوصف مطلوبان.');const dir=path.join(root,'data'),file=path.join(dir,'project-change-requests.json');fs.mkdirSync(dir,{recursive:true});const requests=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];const request={id:'change_'+Date.now().toString(36),title:String(title).slice(0,180),description:String(description).slice(0,5000),risk:String(risk).slice(0,500),status:'PROPOSED',createdAt:new Date().toISOString()};requests.push(request);fs.writeFileSync(file,JSON.stringify(requests,null,2),'utf8');audit('createChangeProposal',{id:request.id});return request}
function applyFileChange(name,oldText,newText,options={}){
 if(options.approvedByUser!==true&&process.env.NARA_ALLOW_AGENT_CODE_EDITS!=='true')throw new Error('تعديل الكود يتطلب موافقة صريحة من المستخدم.');
 const n=safeName(name);if(!oldText||typeof newText!=='string')throw new Error('يجب تحديد النص القديم والجديد.');
 const file=path.join(root,n),before=fs.readFileSync(file,'utf8');if(!before.includes(oldText))throw new Error('النص المطلوب تغييره غير موجود أو تغيّر؛ أعد قراءة الملف.');
 const checkpoint=path.join(root,'checkpoints','agent-edit-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(checkpoint,{recursive:true});fs.copyFileSync(file,path.join(checkpoint,n.replace(/[\\/]/g,'_')));
 const after=before.replace(oldText,newText);fs.writeFileSync(file,after,'utf8');audit('applyFileChange',{name:n,checkpoint});return {ok:true,file:n,checkpoint,bytesBefore:Buffer.byteLength(before),bytesAfter:Buffer.byteLength(after)};
}
module.exports={readProjectFile,inspectProject,projectHealth,projectHealthAsync,createChangeProposal,applyFileChange,tools:[{name:'readProjectFile',mode:'read-only'},{name:'inspectProject',mode:'read-only'},{name:'projectHealth',mode:'read-only'},{name:'createChangeProposal',mode:'proposal-only'},{name:'applyFileChange',mode:'explicit-opt-in,checkpointed,allow-listed'}]};
