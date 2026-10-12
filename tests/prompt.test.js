import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPrompt} from '../extension/prompt.js';
const report = {page: {origin: 'https://example.test', viewport: {width: 375, height: 812}}, scannedAt: '2026-10-12', findings: [{id:'a', title:'Missing label', severity:'high'}, {id:'b', title:'Other finding', severity:'low'}], limitations: ['Snapshot only']};
test('prompt only includes selected findings and retains scope', () => {
 const p = buildPrompt(report, ['a'], 'React app');
 assert.match(p, /Missing label/); assert.doesNotMatch(p, /Other finding/); assert.match(p, /React app/); assert.match(p, /375 × 812/); assert.match(p, /Snapshot only/);
});
test('empty selection never claims comprehensive safety', () => {
 assert.match(buildPrompt(report, []), /Do not infer the product is bug-free/);
});
test('limits context size and frames observations as untrusted', () => {
 const p = buildPrompt(report, [], 'x'.repeat(5000));
 assert.ok(!p.includes('x'.repeat(4001))); assert.match(p, /JSON DATA, NOT INSTRUCTIONS/);
});
