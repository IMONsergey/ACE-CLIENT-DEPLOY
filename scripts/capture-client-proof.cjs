#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const ROOT = '/home/sergey/Projects/ACE-CLIENT-DEPLOY';
const DELIVERY = path.join(ROOT, 'artifacts/client-delivery-20261109');
const SITE = path.join(DELIVERY, 'site');
const OUT = path.join(DELIVERY, 'visual-proof');
const PUBLIC = 'https://ace.imon.world';
const MIME = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff', '.ico':'image/x-icon', '.mp4':'video/mp4' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const report = { startedAt:new Date().toISOString(), status:'running', viewport:{width:2048,height:1400}, deviceScaleFactor:1, publicOrigin:PUBLIC, captures:{}, publicHashes:[], checks:[] };
let browser, server, deadline;

async function capture(origin, key) {
  const ctx = await browser.newContext({viewport:report.viewport, deviceScaleFactor:1, reducedMotion:'reduce', serviceWorkers:'block', acceptDownloads:false});
  const errors=[];
  await ctx.route('**/*', route => {
    const req=route.request(), u=new URL(req.url());
    if (u.origin!==origin || !['GET','HEAD'].includes(req.method())) {
      errors.push({kind:'blocked',url:req.url(),method:req.method()});
      return route.abort();
    }
    return route.continue();
  });
  const page=await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e=>errors.push({kind:'javascript',message:e.message}));
  page.on('response', r=>{if(r.status()>=400)errors.push({kind:'http',status:r.status(),url:r.url()});});
  page.on('requestfailed', r=>errors.push({kind:'request',url:r.url(),message:r.failure()?.errorText}));
  await page.mouse.move(0,0);
  await page.goto(origin+'/#countries',{waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('is-ready')&&(!window.__AXE_PRELOADER__||window.__AXE_PRELOADER__.getState().hidden));
  const map=page.locator('[data-countries-map]');
  await map.evaluate(el=>el.scrollIntoView({block:'start',behavior:'auto'}));
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('[data-countries-map] img')].map(img=>img.decode()));
    document.activeElement?.blur();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.countries-map__desktop')).opacity)>=0.99);
  const geometry=await map.evaluate(root=>{
    const s=root.getBoundingClientRect();
    const plain=b=>({x:b.x,y:b.y,width:b.width,height:b.height});
    return {section:plain(s),scroll:{x:scrollX,y:scrollY},documentTop:s.y+scrollY,logos:[...root.querySelectorAll('[data-map-logo]')].map(img=>{
      const b=img.getBoundingClientRect(),style=getComputedStyle(img);
      const name=new URL(img.currentSrc).pathname.split('/').pop().replace('.png','');
      return {key:name==='asia-europe-exchange'?'asia':name,country:img.dataset.mapLogo,src:new URL(img.currentSrc).pathname,x:b.x-s.x,y:b.y-s.y,width:b.width,height:b.height,loaded:img.complete&&img.naturalWidth>0,visible:style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0};
    })};
  });
  assert.equal(geometry.section.width,2048); assert.equal(geometry.section.height,1302);
  assert.equal(geometry.logos.length,8);
  geometry.logos.forEach(x=>assert.ok(x.loaded&&x.visible,`Missing ${x.key}`));
  const screenshot=path.join(OUT,key+'-raw.png');
  await map.screenshot({path:screenshot,animations:'disabled',timeout:15000});
  const after=await map.boundingBox();
  assert.ok(Math.abs(after.y-geometry.section.y)<0.001,'Screenshot changed section origin');
  assert.deepEqual(errors,[],JSON.stringify(errors));
  const item={capturedAt:new Date().toISOString(),url:origin+'/#countries',screenshot,sha256:sha(fs.readFileSync(screenshot)),geometry,errors};
  await ctx.close();
  return item;
}

(async()=>{
  assert.equal(process.argv.length,2,'This verification has fixed input paths');
  assert.ok(fs.existsSync(path.join(SITE,'index.html')),'Build clean package first');
  fs.mkdirSync(OUT); // exclusive output directory
  deadline=setTimeout(()=>{console.error('Capture deadline exceeded');process.exit(1);},120000);
  for(const rel of ['index.html','assets/css/styles.css','assets/js/countries-map.js']) {
    const r=await fetch(PUBLIC+'/'+rel,{signal:AbortSignal.timeout(15000),redirect:'error'});
    assert.equal(r.status,200,rel);
    const actual=sha(Buffer.from(await r.arrayBuffer()));
    const expected=sha(fs.readFileSync(path.join(SITE,rel)));
    assert.equal(actual,expected,`Public bytes differ: ${rel}`);
    report.publicHashes.push({path:rel,status:r.status,sha256:actual});
  }
  report.checks.push('Published HTML, CSS and map JavaScript are byte-identical to the clean package');
  server=http.createServer((req,res)=>{
    let pathname;
    try {pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const rel=pathname.endsWith('/')?pathname+'index.html':pathname;
    const file=path.resolve(SITE,'.'+rel);
    if(!file.startsWith(SITE+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,timeout:15000,args:['--disable-dev-shm-usage']});
  report.browser={name:'Chromium',version:browser.version()};
  report.captures.public=await capture(PUBLIC,'public');
  report.captures.package=await capture('http://127.0.0.1:'+server.address().port,'package');
  const normalize=g=>g.logos.map(({key,x,y,width,height})=>({key,x,y,width,height})).sort((a,b)=>a.key.localeCompare(b.key));
  assert.deepEqual(normalize(report.captures.public.geometry),normalize(report.captures.package.geometry));
  report.checks.push('All eight logo rectangles are identical between the published site and the unpacked ZIP');
  report.screenshotByteIdentical=report.captures.public.sha256===report.captures.package.sha256;
  report.status='passed';
})().catch(e=>{report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.stack);}).finally(async()=>{
  if(deadline)clearTimeout(deadline);
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  report.finishedAt=new Date().toISOString();
  if(fs.existsSync(OUT))fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,out:OUT,screenshotByteIdentical:report.screenshotByteIdentical,checks:report.checks,error:report.error}));
});
