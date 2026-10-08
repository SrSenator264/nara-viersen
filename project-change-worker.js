'use strict';
// NARA change worker: approval gate only. It never executes arbitrary code.
// The next milestone will add narrowly allow-listed actions one by one.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'data','project-change-requests.json');
if(!fs.existsSync(file)){console.log('[NARA][WORKER] لا توجد طلبات تعديل.');process.exit(0)}
const requests=JSON.parse(fs.readFileSync(file,'utf8'));
let changed=0;
for(const request of requests){
 if(request.status!=='APPROVED')continue;
 request.status='EXECUTION_READY';
 request.workerNote='تمت الموافقة والتحقق من بوابة التنفيذ. لم يُنفّذ كود تلقائيًا.';
 request.readyAt=new Date().toISOString();
 changed++;
 console.log('[NARA][WORKER][READY]',request.id,request.title);
}
fs.writeFileSync(file,JSON.stringify(requests,null,2),'utf8');
console.log('[NARA][WORKER] requests ready:',changed);
