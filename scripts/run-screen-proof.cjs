#!/usr/bin/env node
'use strict';
const {spawnSync}=require('node:child_process');
const ROOT='/home/sergey/Projects/ACE-CLIENT-DEPLOY';
for(const [command,args] of [
  ['/usr/local/bin/imon-node',['scripts/capture-screen-proof.cjs']],
  ['/usr/local/bin/imon-python',['scripts/build-screen-proof.py']],
  ['/usr/bin/pdfinfo',['artifacts/client-delivery-20261109/ACE-Проверка-логотипов.pdf']],
  ['/usr/bin/pdftoppm',['-png','-r','90','artifacts/client-delivery-20261109/ACE-Проверка-логотипов.pdf','artifacts/client-delivery-20261109/screen-proof/page']],
]){
  const r=spawnSync(command,args,{cwd:ROOT,encoding:'utf8',timeout:240000,maxBuffer:2*1024*1024});
  if(r.stdout)process.stdout.write(r.stdout);if(r.stderr)process.stderr.write(r.stderr);
  if(r.error||r.status!==0)throw new Error(command+' failed: '+(r.error?.message||r.status));
}
