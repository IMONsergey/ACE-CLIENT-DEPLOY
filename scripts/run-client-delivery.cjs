#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const ROOT='/home/sergey/Projects/ACE-CLIENT-DEPLOY';
const OUT=path.join(ROOT,'artifacts/client-delivery-20261109');
const run=(cmd,args)=>{
  const r=spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
  if(r.stdout)process.stdout.write(r.stdout);
  if(r.stderr)process.stderr.write(r.stderr);
  if(r.error||r.status!==0)throw new Error(cmd+' failed: '+(r.error?.message||r.status));
};
run('/usr/local/bin/imon-node',['scripts/build-client-package.cjs','--qa-report','/home/sergey/Work/Reports/ace-map-20261109/20261109T102632Z-1769891/report.json','--code-proof',path.join(ROOT,'artifacts/code-proof-map-20261109-r2.json')]);
run('/usr/local/bin/imon-node',['scripts/capture-client-proof.cjs']);
run('/usr/local/bin/imon-python',['scripts/build-logo-proof.py']);
run('/usr/bin/pdfinfo',[path.join(OUT,'ACE-Проверка-логотипов.pdf')]);
run('/usr/bin/pdftoppm',['-png','-r','90',path.join(OUT,'ACE-Проверка-логотипов.pdf'),path.join(OUT,'visual-proof/page')]);
fs.copyFileSync(path.join(OUT,'visual-proof/page-1.png'),path.join(OUT,'ACE-Сравнение.png'),fs.constants.COPYFILE_EXCL);
const files=['ACE-Разработчикам.zip','ACE-Проверка-логотипов.pdf','ACE-Сравнение.png'].map(name=>{
  const p=path.join(OUT,name);const bytes=fs.readFileSync(p);
  return {name,path:p,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
fs.writeFileSync(path.join(OUT,'delivery-files.json'),JSON.stringify({createdAt:new Date().toISOString(),files},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'ready-for-visual-review',files}));
