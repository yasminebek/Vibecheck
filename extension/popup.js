import {auditPage} from './audit.js';
import {buildPrompt} from './prompt.js';
const $ = id => document.getElementById(id);
let report = null;
function status(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }
function regenerate() {
  if (report) $('prompt').value = buildPrompt(report, [...document.querySelectorAll('#findings input:checked')].map(x => x.value), $('context').value);
}
function render() {
  $('count').textContent = report.findings.length;
  $('origin').textContent = report.page.origin;
  $('findings').replaceChildren();
  for (const f of report.findings) {
    const card = document.createElement('article'); card.className = 'finding';
    const badge = document.createElement('span'); badge.className = `badge ${f.severity}`; badge.textContent = `${f.severity} · ${f.category}${f.confidence === 'review' ? ' · Review' : ''}`;
    const label = document.createElement('label');
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = f.id; check.checked = f.selectedByDefault !== false; check.addEventListener('change', regenerate);
    label.append(check, document.createTextNode(f.title));
    const evidence = document.createElement('p'); evidence.textContent = f.evidence;
    const detail = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Evidence & suggested fix'; detail.append(summary);
    const fix = document.createElement('p'); fix.textContent = f.fix; detail.append(fix);
    f.selectors.forEach(s => { const code = document.createElement('code'); code.textContent = s; detail.append(code); });
    card.append(badge, label, evidence, detail); $('findings').append(card);
  }
  $('limits').replaceChildren(...report.limitations.map(s => { const li = document.createElement('li'); li.textContent = s; return li; }));
  $('results').hidden = false;
  regenerate();
}
$('scan').addEventListener('click', async () => {
  $('scan').disabled = true; $('results').hidden = true; report = null; status('Inspecting the current page…');
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || '')) throw new Error('Open a regular HTTP or HTTPS website first. Browser settings, extension pages and local files cannot be scanned.');
    const [result] = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: auditPage});
    if (!result?.result) throw new Error('The page did not return a report. Reload it and try again.');
    report = result.result; render(); status(report.findings.length ? 'Scan complete. Review findings, then copy your prompt.' : 'No issues found by these checks. Manual testing is still needed.');
  } catch (e) { status(`Unable to scan. ${e.message} Some protected pages block extensions.`, true); }
  finally { $('scan').disabled = false; }
});
$('context').addEventListener('input', regenerate);
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('prompt').value); status('Prompt copied. Paste it into your coding agent.'); }
  catch { $('prompt').focus(); $('prompt').select(); status('Clipboard unavailable. The prompt is selected; press Ctrl+C or Cmd+C.', true); }
});
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'vibecheck-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
