#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT='/home/sergey/Projects/ACE-CLIENT-DEPLOY';
const OUT=path.join(ROOT,'artifacts/client-delivery-20261109');
const DESKTOP='/home/sergey/Desktop/ACE-Для-разработчиков-2026-11-09';
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.deepEqual(process.argv.slice(2),['--six-pages-reviewed']);
const pack=JSON.parse(fs.readFileSync(path.join(OUT,'package-proof.json')));
const capture=JSON.parse(fs.readFileSync(path.join(OUT,'visual-proof/capture.json')));
const proof=JSON.parse(fs.readFileSync(path.join(OUT,'visual-proof/logo-position-proof.json')));
assert.equal(pack.status,'verified');assert.equal(pack.fileCount,113);
assert.equal(capture.status,'passed');assert.equal(capture.screenshotByteIdentical,true);
assert.equal(proof.status,'passed');assert.equal(proof.logos.length,8);
assert.equal(proof.packagedScreenshotPixelIdenticalToPublished,true);
assert.equal(proof.maxPositionDeltaPx,1.328125);assert.equal(proof.maxRasterBoxDeltaPx,1);
assert.equal(digest(path.join(OUT,'ACE-Разработчикам.zip')),pack.archiveSha256);
assert.equal(digest(path.join(OUT,'ACE-Проверка-логотипов.pdf')),proof.pdf.sha256);
assert.equal(digest(path.join(OUT,'ACE-Сравнение.png')),digest(path.join(OUT,'visual-proof/page-1.png')));
fs.mkdirSync(DESKTOP,{mode:0o755});
const names=['ACE-Разработчикам.zip','ACE-Проверка-логотипов.pdf','ACE-Сравнение.png'];
const files=names.map(name=>{
  const source=path.join(OUT,name),destination=path.join(DESKTOP,name);
  assert(fs.lstatSync(source).isFile()&&!fs.lstatSync(source).isSymbolicLink());
  fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
  const sha256=digest(source);assert.equal(digest(destination),sha256);
  return {name,path:source,desktop:destination,bytes:fs.statSync(source).size,sha256};
});
const record={status:'ready',createdAt:new Date().toISOString(),files,
  visualReview:{pages:[1,2,3,4,5,6],textAndImageClipping:false,allTargetLogosVisible:true,sourceCaptionsCorrect:true,globalCropDisclosed:true},
  packageProofSha256:digest(path.join(OUT,'package-proof.json')),
  captureProofSha256:digest(path.join(OUT,'visual-proof/capture.json')),
  geometryProofSha256:digest(path.join(OUT,'visual-proof/logo-position-proof.json')),
  runtimeChanged:false,publishedSiteChanged:false};
fs.renameSync(path.join(OUT,'delivery-files.json'),path.join(OUT,'visual-proof/revision-1/delivery-files.json'));
fs.writeFileSync(path.join(OUT,'delivery-files.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record,null,2));
