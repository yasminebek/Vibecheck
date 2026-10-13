import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

// Requires Linux, Xvfb and xdotool. The temporary copy adds only a keyboard
// shortcut for the existing action; no host permissions or API stubs are added.
const temporary = await mkdtemp(join(tmpdir(), 'vibecheck-real-'));
const extension = join(temporary, 'extension');
await cp(resolve('extension'), extension, {recursive:true});
const manifest = JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
manifest.commands = {'_execute_action': {suggested_key: {default:'Alt+Shift+V'}}};
await writeFile(join(extension,'manifest.json'),JSON.stringify(manifest));
const server = createServer((req,res)=> {
 if (req.url === '/missing.png') {res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/html');
 res.end('<!doctype html><html><head><title>VibeCheck real extension test</title></head><body><h1>Booking demo</h1><label>Name <input></label><button></button><img src="/missing.png" width="60" height="60"><a href="#">Book now</a></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let context;
try {
 context = await chromium.launchPersistentContext(join(temporary,'profile'), {
  headless:false, channel:'chromium', ignoreDefaultArgs:['--disable-extensions'],
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`, '--no-sandbox'],
 });
 const page = await context.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.bringToFront();
 // OS-level activation exercises Chrome's actual activeTab grant.
 const windowId = execFileSync('xdotool',['search','--onlyvisible','--name','VibeCheck real extension test'],{encoding:'utf8'}).trim().split('\n')[0];
 execFileSync('xdotool',['windowfocus','--sync',windowId]);
 const cdp = await context.newCDPSession(page);
 execFileSync('xdotool',['key','--clearmodifiers','alt+shift+v']);
 let target;
 for (let attempt=0; attempt<50; attempt++) {
  target = (await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.startsWith('chrome-extension://') && t.url.endsWith('/popup.html'));
  if (target) break;
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(target,'Extension popup did not open');
 // Extension action popups are not automatically attached by Playwright.
 // Use a nested CDP session against the actual popup, without API stubs.
 const {sessionId} = await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let nextId=0;
 const pending = new Map();
 cdp.on('Target.receivedMessageFromTarget', event=>{
  if (event.sessionId !== sessionId) return;
  const message = JSON.parse(event.message);
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id); clearTimeout(call.timer);
  if (message.error) call.reject(new Error(JSON.stringify(message.error))); else call.resolve(message.result);
 });
 async function send(method,params={}) {
  const id=++nextId;
  const result=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},10000);
   pending.set(id,{resolve,reject,timer});
  });
  await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});
  return result;
 }
 async function evaluate(expression) {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
  return result.result.value;
 }
 async function wait(expression) {
  for(let i=0;i<100;i++) {if(await evaluate(expression)) return; await new Promise(r=>setTimeout(r,100));}
  throw new Error('Popup condition timed out: '+expression+'; status: '+await evaluate('document.getElementById("status")?.textContent'));
 }
 async function click(id) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({block:'center'})`);
  const box=await evaluate(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
 }
 await wait('document.readyState === "complete"');
 await click('scan');
 await wait('!document.getElementById("results").hidden');
 const prompt=await evaluate('document.getElementById("prompt").value');
 assert.match(prompt,/Images failed to render/);
 assert.match(prompt,/Buttons may lack accessible names/);
 assert.match(prompt,/Placeholder links need review/);
 await click('copy');
 await wait('document.getElementById("status").textContent.includes("Prompt copied")');
 await click('context');
 execFileSync('xdotool',['key','--clearmodifiers','ctrl+v']);
 await wait('document.getElementById("context").value.length > 0');
 assert.equal(await evaluate('document.getElementById("context").value'),prompt.slice(0,4000));
 console.log('PASS: real extension popup, activeTab grant, script injection, evidence prompt, clipboard write and paste.');
} finally {
 await context?.close(); await new Promise(r=>server.close(r)); await rm(temporary,{recursive:true,force:true});
}
