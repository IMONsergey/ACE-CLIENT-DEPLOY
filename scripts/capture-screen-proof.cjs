#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {chromium}=require('playwright');
const ROOT='/home/sergey/Projects/ACE-CLIENT-DEPLOY';
const DELIVERY=path.join(ROOT,'artifacts/client-delivery-20261109');
const SITE=path.join(DELIVERY,'site');
const OUT=path.join(DELIVERY,'screen-proof');
const PUBLIC='https://ace.imon.world';
const SIZES=[{width:1920,height:1080},{width:1440,height:900}];
const MIME={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon','.mp4':'video/mp4'};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const report={startedAt:new Date().toISOString(),status:'running',publicOrigin:PUBLIC,captureType:'visible browser viewport, fullPage false',sourcePixelsChanged:false,screens:[],publicHashes:[]};
let browser,server,deadline;

async function capture(origin,key,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',serviceWorkers:'block',acceptDownloads:false});
  const errors=[];
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin||!['GET','HEAD'].includes(request.method())){errors.push({kind:'blocked',url:request.url()});return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push({kind:'javascript',message:e.message}));
  page.on('response',r=>{if(r.status()>=400)errors.push({kind:'http',url:r.url(),status:r.status()});});
  page.on('requestfailed',r=>errors.push({kind:'request',url:r.url(),message:r.failure()?.errorText}));
  await page.goto(origin+'/#countries',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('is-ready')&&(!window.__AXE_PRELOADER__||window.__AXE_PRELOADER__.getState().hidden));
  await page.mouse.move(0,0);
  const map=page.locator('[data-countries-map]');
  await map.evaluate(el=>el.scrollIntoView({block:'start',behavior:'auto'}));
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('[data-countries-map] img')].map(img=>img.decode()));
    document.activeElement?.blur();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await map.evaluate(el=>el.scrollIntoView({block:'start',behavior:'auto'}));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.countries-map__desktop')).opacity)>=0.999);
  const geometry=await map.evaluate(root=>{
    const plain=el=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
    const vp=root.querySelector('.countries-map__viewport');
    return{section:plain(root),mapViewport:plain(vp),scroll:{x:scrollX,y:scrollY},browser:{innerWidth,innerHeight,devicePixelRatio,visualViewportScale:visualViewport.scale,documentZoom:getComputedStyle(document.documentElement).zoom},logos:[...root.querySelectorAll('[data-map-logo]')].map(img=>{
      const b=plain(img),name=new URL(img.currentSrc).pathname.split('/').pop().replace('.png',''),style=getComputedStyle(img);
      return{key:name==='asia-europe-exchange'?'asia':name,country:img.dataset.mapLogo,...b,loaded:img.complete&&img.naturalWidth>0,visible:style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0};
    })};
  });
  assert.equal(geometry.browser.innerWidth,viewport.width);assert.equal(geometry.browser.innerHeight,viewport.height);
  assert.equal(geometry.browser.devicePixelRatio,1);assert.equal(geometry.browser.visualViewportScale,1);
  assert.ok(['1','normal'].includes(geometry.browser.documentZoom));
  assert.equal(geometry.mapViewport.width,viewport.width);assert.equal(geometry.logos.length,8);
  for(const l of geometry.logos)assert.ok(l.loaded&&l.visible&&l.x>=0&&l.y>=0&&l.x+l.width<=viewport.width&&l.y+l.height<=viewport.height,'Logo not wholly visible: '+l.key);
  const file=path.join(OUT,`${key}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({path:file,fullPage:false,animations:'disabled',timeout:15000});
  assert.deepEqual(errors,[],JSON.stringify(errors));
  const result={capturedAt:new Date().toISOString(),url:origin+'/#countries',screenshot:file,sha256:sha(fs.readFileSync(file)),geometry,errors};
  await context.close();return result;
}

(async()=>{
  assert.equal(process.argv.length,2);assert.ok(fs.existsSync(path.join(SITE,'index.html')));
  fs.mkdirSync(OUT);
  deadline=setTimeout(()=>{console.error('Screen proof capture deadline');process.exit(1);},210000);
  for(const rel of ['index.html','assets/css/styles.css','assets/js/countries-map.js']){
    const r=await fetch(PUBLIC+'/'+rel,{signal:AbortSignal.timeout(15000),redirect:'error'});assert.equal(r.status,200);
    const actual=sha(Buffer.from(await r.arrayBuffer())),expected=sha(fs.readFileSync(path.join(SITE,rel)));
    assert.equal(actual,expected,rel);report.publicHashes.push({path:rel,status:200,sha256:actual});
  }
  server=http.createServer((req,res)=>{
    let p;try{p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const file=path.resolve(SITE,'.'+(p.endsWith('/')?p+'index.html':p));
    if(!file.startsWith(SITE+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,timeout:15000,args:['--disable-dev-shm-usage']});
  report.browser={name:'Chromium',version:browser.version()};
  for(const viewport of SIZES){
    const pub=await capture(PUBLIC,'public',viewport);
    const pkg=await capture('http://127.0.0.1:'+server.address().port,'package',viewport);
    assert.deepEqual(pub.geometry,pkg.geometry,'Clean package geometry mismatch');
    report.screens.push({viewport,public:pub,package:pkg,screenshotByteIdentical:pub.sha256===pkg.sha256});
  }
  report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.stack);}).finally(async()=>{
  if(deadline)clearTimeout(deadline);if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();
  if(fs.existsSync(OUT))fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,screens:report.screens.map(s=>({viewport:s.viewport,screenshotByteIdentical:s.screenshotByteIdentical})),out:OUT,error:report.error}));
});
