import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createRequire} from 'node:module';
import {auditPage} from '../extension/audit.js';
const require = createRequire(import.meta.url);
const {chromium} = process.env.PLAYWRIGHT_MODULE_PATH ? require(process.env.PLAYWRIGHT_MODULE_PATH) : await import('playwright');
const extension = resolve('extension');
const profile = await mkdtemp(join(tmpdir(), 'vibecheck-test-'));
const server = createServer((req,res) => {
 if (req.url.startsWith('/bad.png')) { res.writeHead(404); res.end(); return; }
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><html><head><style>body{width:1800px}img{width:40px;height:40px}</style></head><body><h2>Fixture</h2><input value="PRIVATE_FORM_VALUE"><button></button><a href="#">Go</a><a href="#missing">Missing</a><img src="/bad.png"><p>PRIVATE_PAGE_TEXT</p><div tabindex="3">Tab</div></body></html>`);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let context;
try {
 context = await chromium.launchPersistentContext(profile, {headless:true, channel:'chromium', args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`, '--no-sandbox']});
 const page = await context.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/private-path?token=PRIVATE_TOKEN`);
 const report = await page.evaluate(auditPage);
 const ids = report.findings.map(x=>x.id);
 for (const id of ['title','language','viewport','field-name','button-name','image-alt','broken-image','placeholder-link','fragment','overflow','tab-order']) assert.ok(ids.includes(id), `Missing expected ${id}`);
 const serialized = JSON.stringify(report);
 for (const secret of ['PRIVATE_FORM_VALUE','PRIVATE_PAGE_TEXT','PRIVATE_TOKEN','private-path']) assert.ok(!serialized.includes(secret), `Leaked ${secret}`);
 // A minimal well-formed page must not receive the above findings.
 await page.setContent('<!doctype html><html lang="en"><head><title>Healthy</title><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A fixture"></head><body><h1>Healthy</h1><label for="email">Email</label><input id="email"><button aria-label="Save"><svg aria-hidden="true"></svg></button><a href="#main">Go</a><main id="main">Main</main></body></html>');
 const healthy = await page.evaluate(auditPage);
 assert.equal(healthy.findings.length, 0, JSON.stringify(healthy.findings));
 // Test UI with a deterministic Chrome API stub, while executing real audit function in fixture.
 // Real activeTab grants require clicking the toolbar manually (see README checklist).
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const bad = await page.evaluate(auditPage);
 const uiServer = createServer(async (req,res) => {
  const {readFile} = await import('node:fs/promises');
  const name = req.url.split('?')[0];
  if (!['/popup.html','/popup.css','/popup.js','/audit.js','/prompt.js'].includes(name)) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(await readFile(join(extension,name)));
 });
 await new Promise(r=>uiServer.listen(0,'127.0.0.1',r));
 try {
 const ui = await context.newPage();
 await ui.addInitScript(report => {window.chrome = {tabs:{query:async()=>[{id:1,url:'https://example.test'}]},scripting:{executeScript:async()=>[{result:report}]}};}, bad);
 await ui.goto(`http://127.0.0.1:${uiServer.address().port}/popup.html`);
 await ui.getByRole('button',{name:'Analyze current page'}).click();
 await ui.locator('#results').waitFor({state:'visible'});
 assert.match(await ui.locator('#prompt').inputValue(), /Images failed to render/);
 const hashReview = ui.locator('input[value="fragment"]');
 assert.equal(await hashReview.isChecked(), false);
 assert.equal(await ui.getByText('Hash navigation — verify manually', {exact:true}).isVisible(), true);
 assert.doesNotMatch(await ui.locator('#prompt').inputValue(), /Hash navigation — verify manually/);
 await hashReview.focus();
 await ui.keyboard.press('Space');
 assert.equal(await hashReview.isChecked(), true);
 assert.match(await ui.locator('#prompt').inputValue(), /Hash navigation — verify manually/);
 await hashReview.uncheck();
 assert.doesNotMatch(await ui.locator('#prompt').inputValue(), /Hash navigation — verify manually/);
 await ui.locator('input[value="broken-image"]').uncheck();
 assert.doesNotMatch(await ui.locator('#prompt').inputValue(), /Images failed to render/);
 await ui.locator('#context').fill('Booking application');
 assert.match(await ui.locator('#prompt').inputValue(), /Booking application/);
 assert.doesNotMatch(await ui.locator('#prompt').inputValue(), /Hash navigation — verify manually/);
 const dl = ui.waitForEvent('download'); await ui.getByRole('button',{name:'Download report JSON'}).click();
 assert.equal((await dl).suggestedFilename(), 'vibecheck-report.json');
 await ui.screenshot({path: '../vibecheck-test-ui.png', fullPage:true});
 await ui.evaluate(()=>{window.chrome.tabs.query=async()=>[{id:1,url:'chrome://settings'}];});
 await ui.getByRole('button',{name:'Analyze current page'}).click();
 await ui.waitForFunction(()=>document.getElementById('status').textContent.includes('Unable to scan'));
 assert.equal(await ui.locator('#results').isVisible(), false);
 } finally {await new Promise(r=>uiServer.close(r));}
 console.log('PASS: browser audit, healthy fixture, privacy, prompt selection, context, report download and restricted-page UI. Toolbar activeTab grant still requires manual validation.');
} finally {
 await context?.close(); await new Promise(r=>server.close(r)); await rm(profile,{recursive:true,force:true});
}
