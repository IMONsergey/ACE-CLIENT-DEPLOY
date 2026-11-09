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
assert.deepEqual(process.argv.slice(2),['--four-pages-reviewed']);
const pack=JSON.parse(fs.readFileSync(path.join(OUT,'package-proof.json')));
const capture=JSON.parse(fs.readFileSync(path.join(OUT,'screen-proof/capture.json')));
const proof=JSON.parse(fs.readFileSync(path.join(OUT,'screen-proof/screen-geometry-proof.json')));
assert.equal(pack.status,'verified');assert.equal(pack.fileCount,113);
assert.equal(capture.status,'passed');assert.equal(capture.screens.length,2);
assert.equal(proof.status,'passed');assert.equal(proof.normalViewportScreens.length,2);
assert.deepEqual(proof.normalViewportScreens.map(s=>s.viewport),[{width:1920,height:1080},{width:1440,height:900}]);
for(const screen of proof.normalViewportScreens){assert.equal(screen.rows.length,8);assert.ok(screen.maxPositionPx<=2);assert.ok(screen.maxRasterBoxPx<=2);}
assert.equal(digest(path.join(OUT,'ACE-Разработчикам.zip')),pack.archiveSha256);
assert.equal(digest(path.join(OUT,'ACE-Проверка-логотипов.pdf')),proof.pdf.sha256);
assert.equal(digest(path.join(OUT,'ACE-Экран-1920.png')),proof.preview.sha256);
const comparisonSource=path.join(OUT,'screen-proof/page-1.png');
const comparisonOutput=path.join(OUT,'ACE-Сравнение-1920.png');
assert(fs.lstatSync(comparisonSource).isFile());
if(fs.existsSync(comparisonOutput))assert.equal(digest(comparisonOutput),digest(comparisonSource));
else fs.copyFileSync(comparisonSource,comparisonOutput,fs.constants.COPYFILE_EXCL);
try{fs.mkdirSync(DESKTOP,{mode:0o755});}catch(error){if(error.code!=='EEXIST')throw error;}
assert(fs.lstatSync(DESKTOP).isDirectory()&&!fs.lstatSync(DESKTOP).isSymbolicLink());
const names=['ACE-Разработчикам.zip','ACE-Проверка-логотипов.pdf','ACE-Экран-1920.png','ACE-Сравнение-1920.png'];
const files=names.map(name=>{
  const source=path.join(OUT,name),destination=path.join(DESKTOP,name);
  assert(fs.lstatSync(source).isFile()&&!fs.lstatSync(source).isSymbolicLink());
  const sha256=digest(source);
  if(fs.existsSync(destination)){assert(fs.lstatSync(destination).isFile()&&!fs.lstatSync(destination).isSymbolicLink());assert.equal(digest(destination),sha256);}
  else fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);
  assert.equal(digest(destination),sha256);
  return {name,path:source,desktop:destination,bytes:fs.statSync(source).size,sha256};
});
const record={status:'ready',createdAt:new Date().toISOString(),files,
  visualReview:{pages:[1,2,3,4],textAndImageClipping:false,allTargetLogosVisible:true,sourceCaptionsCorrect:true,actualBrowserScreenshotsUnmodified:true,normalViewports:[{width:1920,height:1080},{width:1440,height:900}],zoomPercent:100},
  qualifications:['PASS covers positions and sizes of all eight map logos, not pixel identity of the whole section.','At 1440px, country legend cards and text are larger than the uniformly scaled reference; the lower China card lies below the normal viewport.'],
  packageProofSha256:digest(path.join(OUT,'package-proof.json')),
  captureProofSha256:digest(path.join(OUT,'screen-proof/capture.json')),
  geometryProofSha256:digest(path.join(OUT,'screen-proof/screen-geometry-proof.json')),
  runtimeChanged:false,publishedSiteChanged:false};
fs.renameSync(path.join(OUT,'delivery-files.json'),path.join(OUT,'visual-proof/revision-1/delivery-files.json'));
fs.writeFileSync(path.join(OUT,'delivery-files.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record,null,2));
