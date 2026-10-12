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
 const popupPromise = context.waitForEvent('page',{timeout:15000});
 execFileSync('xdotool',['key','--clearmodifiers','alt+shift+v']);
 const popup = await popupPromise;
 await popup.waitForLoadState('domcontentloaded');
 assert.ok(popup.url().startsWith('chrome-extension://'), popup.url());
 const errors=[]; popup.on('pageerror',e=>errors.push(e.message));
 await popup.getByRole('button',{name:'Analyze current page'}).click();
 await popup.locator('#results').waitFor({state:'visible',timeout:15000});
 const prompt = await popup.locator('#prompt').inputValue();
 assert.match(prompt,/Images failed to render/);
 assert.match(prompt,/Buttons may lack accessible names/);
 assert.match(prompt,/Placeholder links need review/);
 await popup.getByRole('button',{name:'Copy prompt',exact:true}).click();
 await popup.waitForFunction(()=>document.getElementById('status').textContent.includes('Prompt copied'));
 // Verify the OS clipboard by pasting into the editable context field.
 await popup.locator('#context').focus();
 await popup.keyboard.press('Control+V');
 assert.equal(await popup.locator('#context').inputValue(),prompt.slice(0,4000));
 assert.deepEqual(errors,[]);
 console.log('PASS: real extension popup, activeTab grant, script injection, evidence prompt, clipboard write and paste.');
} finally {
 await context?.close(); await new Promise(r=>server.close(r)); await rm(temporary,{recursive:true,force:true});
}
