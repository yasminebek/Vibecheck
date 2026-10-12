import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {auditPage} from '../extension/audit.js';
function scan(html, url = 'https://example.test/private-path?token=SECRET_TOKEN') {
 const dom = new JSDOM(html,{url, runScripts:'outside-only', pretendToBeVisual:true});
 const w = dom.window;
 // jsdom has no layout engine. Explicitly simulate rendered rectangles and timing.
 w.HTMLElement.prototype.getClientRects = function() {return this.hidden ? [] : [{width:100,height:30}];};
 w.performance.getEntriesByType = () => [];
 try { return JSON.parse(JSON.stringify(w.eval(`(${auditPage.toString()})()`))); } finally {w.close();}
}
test('detects broken-page rules without exporting private content', () => {
 const r = scan('<html><body><input value="SECRET_VALUE"><button></button><a href="#">SECRET_TEXT</a><a href="#missing">Target</a><img><div tabindex="2">tab</div></body></html>');
 const ids = r.findings.map(f=>f.id);
 for (const id of ['title','language','viewport','description','heading','field-name','button-name','image-alt','placeholder-link','fragment','tab-order']) assert.ok(ids.includes(id),id);
 for (const secret of ['SECRET_VALUE','SECRET_TEXT','SECRET_TOKEN','private-path']) assert.ok(!JSON.stringify(r).includes(secret), secret);
 assert.equal(r.page.origin,'https://example.test');
});
test('healthy fixture does not trigger false positives', () => {
 const r = scan('<html lang="en"><head><title>Good</title><meta name="description" content="Good"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Good</h1><label for="x">Email</label><input id="x"><button aria-label="Close"></button><a href="#target">Go</a><main id="target">Target</main><img alt=""></body></html>');
 assert.equal(r.findings.length,0,JSON.stringify(r.findings));
});
test('hidden controls and decorative images are excluded', () => {
 const r = scan('<body><button hidden></button><input style="display:none"><div aria-hidden="true"><button></button></div><img role="presentation"></body>');
 for (const id of ['button-name','field-name','image-alt']) assert.ok(!r.findings.some(f=>f.id===id),id);
});
test('security signals distinguish localhost from external HTTP', () => {
 const html = '<form action="http://example.test/login"><input type="password" aria-label="Password"></form>';
 assert.ok(scan(html).findings.some(f=>f.id==='password-http'));
 assert.ok(scan('', 'http://example.test').findings.some(f=>f.id==='http'));
 assert.ok(!scan('', 'http://localhost:3000').findings.some(f=>f.id==='http'));
});
test('caps selectors but preserves total affected count', () => {
 const f = scan('<body>'+ '<button></button>'.repeat(10)+'</body>').findings.find(f=>f.id==='button-name');
 assert.equal(f.count,10); assert.equal(f.selectors.length,5);
});
