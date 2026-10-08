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
function projectHealth(){const files=inspectProject().files;const js=files.filter(x=>/\.js$/i.test(x)),issues=[];for(const file of js){const check=childProcess.spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',timeout:5000,windowsHide:true});if(check.status!==0)issues.push({file,message:String(check.stderr||check.stdout||'Syntax error').trim().slice(0,500)})}const score=Math.max(0,100-(issues.length*20));audit('projectHealth',{score,issues:issues.length});return {score,files:files.length,issues,checkedAt:new Date().toISOString()}}
function createChangeProposal(title,description,risk='غير محدد'){if(!title||!description)throw new Error('العنوان والوصف مطلوبان.');const dir=path.join(root,'data'),file=path.join(dir,'project-change-requests.json');fs.mkdirSync(dir,{recursive:true});const requests=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];const request={id:'change_'+Date.now().toString(36),title:String(title).slice(0,180),description:String(description).slice(0,5000),risk:String(risk).slice(0,500),status:'PROPOSED',createdAt:new Date().toISOString()};requests.push(request);fs.writeFileSync(file,JSON.stringify(requests,null,2),'utf8');audit('createChangeProposal',{id:request.id});return request}
function applyFileChange(name,oldText,newText,options={}){
 if(options.approvedByUser!==true&&process.env.NARA_ALLOW_AGENT_CODE_EDITS!=='true')throw new Error('تعديل الكود يتطلب موافقة صريحة من المستخدم.');
 const n=safeName(name);if(!oldText||typeof newText!=='string')throw new Error('يجب تحديد النص القديم والجديد.');
 const file=path.join(root,n),before=fs.readFileSync(file,'utf8');if(!before.includes(oldText))throw new Error('النص المطلوب تغييره غير موجود أو تغيّر؛ أعد قراءة الملف.');
 const checkpoint=path.join(root,'checkpoints','agent-edit-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(checkpoint,{recursive:true});fs.copyFileSync(file,path.join(checkpoint,n.replace(/[\\/]/g,'_')));
 const after=before.replace(oldText,newText);fs.writeFileSync(file,after,'utf8');audit('applyFileChange',{name:n,checkpoint});return {ok:true,file:n,checkpoint,bytesBefore:Buffer.byteLength(before),bytesAfter:Buffer.byteLength(after)};
}
module.exports={readProjectFile,inspectProject,projectHealth,createChangeProposal,applyFileChange,tools:[{name:'readProjectFile',mode:'read-only'},{name:'inspectProject',mode:'read-only'},{name:'projectHealth',mode:'read-only'},{name:'createChangeProposal',mode:'proposal-only'},{name:'applyFileChange',mode:'explicit-opt-in,checkpointed,allow-listed'}]};
