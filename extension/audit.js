/** Self-contained: Chrome serializes this function into the tab's isolated world. */
export function auditPage() {
  const findings = [];
  const limitations = ['Single main-frame snapshot at the current viewport; other routes, frames and shadow DOM are not inspected.', 'Heuristics are not a full accessibility, security or performance audit.', 'No backend, source code, response headers, console history or business flows are inspected.', 'No links are fetched, buttons clicked or forms submitted. Lazy images can require a second scan after scrolling.'];
  const q = selector => [...document.querySelectorAll(selector)];
  const visible = el => {
    if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };
  // Structural selectors deliberately omit IDs, class names and page text.
  const selector = el => {
    if (!el) return 'document';
    const parts = [];
    while (el && el.nodeType === 1) {
      const name = el.localName;
      const siblings = el.parentElement ? [...el.parentElement.children].filter(x => x.localName === name) : [el];
      parts.unshift(name + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(el) + 1})` : ''));
      el = el.parentElement;
    }
    return parts.join(' > ');
  };
  const named = el => {
    const refs = (el.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
    if (refs.some(id => document.getElementById(id)?.textContent.trim())) return true;
    if (el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim()) return true;
    if (el.labels && [...el.labels].some(x => x.textContent.trim())) return true;
    if (el.matches('input[type="submit"],input[type="reset"]')) return true;
    if (el.matches('input[type="button"]') && el.value.trim()) return true;
    if (el.matches('input[type="image"]') && el.alt.trim()) return true;
    if (el.matches('input,select,textarea')) return false;
    const copy = el.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"],[hidden],script,style').forEach(x => x.remove());
    return !!copy.textContent.trim() || [...copy.querySelectorAll('img')].some(x => x.alt.trim()) || !!copy.querySelector('svg title');
  };
  const add = (id, category, severity, title, elements, evidence, fix, verify, confidence = 'high', selectedByDefault = true) => {
    findings.push({id, category, severity, title, count: elements.length || 1, selectors: elements.slice(0, 5).map(selector), evidence, fix, verify, confidence, selectedByDefault});
  };
  if (!document.title.trim()) add('title', 'Discovery', 'medium', 'Page title is missing', [], 'The document title is empty.', 'Set a meaningful route-specific document title.', 'Check the browser tab and rendered document title.');
  if (!document.documentElement.lang.trim()) add('language', 'Accessibility', 'medium', 'Document language is missing', [document.documentElement], 'The html element has no non-empty lang attribute.', 'Declare the correct document language.', 'Verify the lang attribute matches the primary page language.');
  if (!q('meta[name="viewport"]').some(x => /width\s*=\s*device-width/i.test(x.content))) add('viewport', 'Layout', 'medium', 'Responsive viewport is missing', [], 'No viewport metadata with width=device-width was found.', 'Use device-width viewport metadata without disabling zoom.', 'Check the layout at 375px and 1280px widths.');
  if (!q('meta[name="description"]').some(x => x.content.trim())) add('description', 'Discovery', 'low', 'Meta description is missing', [], 'No non-empty meta description was found.', 'For public indexable routes, add a relevant description; skip private app screens.', 'Inspect rendered metadata on public routes.', 'review');
  const h1 = q('h1').filter(visible);
  if (!h1.length) add('heading', 'Accessibility', 'low', 'No visible main heading', [], 'No visible h1 was found in this snapshot.', 'Review the heading hierarchy and provide a main heading where appropriate.', 'Check that headings communicate the page structure.', 'review');
  const images = q('img').filter(visible);
  const missingAlt = images.filter(x => !x.hasAttribute('alt') && !x.getAttribute('aria-label')?.trim() && !x.getAttribute('aria-labelledby')?.trim() && !['presentation','none'].includes(x.getAttribute('role')));
  if (missingAlt.length) add('image-alt', 'Accessibility', 'medium', 'Images lack text alternatives', missingAlt, `${missingAlt.length} visible images have no alt or ARIA naming attribute.`, 'Add meaningful alt text for informative images and alt="" for decorative images.', 'Verify each image purpose and accessible name.');
  const broken = images.filter(x => (x.currentSrc || x.getAttribute('src')) && x.complete && x.naturalWidth === 0);
  if (broken.length) add('broken-image', 'Reliability', 'high', 'Images failed to render', broken, `${broken.length} complete images have zero intrinsic width.`, 'Inspect image requests and correct source paths, deployment assets or access rules; provide fallbacks.', 'Reload and verify images load with nonzero naturalWidth.');
  const fields = q('input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]):not([type="image"]),select,textarea').filter(visible).filter(x => !named(x));
  if (fields.length) add('field-name', 'Accessibility', 'high', 'Form controls may lack accessible names', fields, `${fields.length} visible fields lack a detected label, title or ARIA name. Placeholder text is not counted as a label.`, 'Associate visible labels with fields using label/for or a suitable accessible naming mechanism.', 'Inspect the accessibility tree and navigate the form with a screen reader.', 'review');
  const buttons = q('button,[role="button"],input[type="button"],input[type="image"]').filter(visible).filter(x => !named(x));
  if (buttons.length) add('button-name', 'Accessibility', 'high', 'Buttons may lack accessible names', buttons, `${buttons.length} visible buttons have no detected name.`, 'Give each button a concise accessible name describing its action.', 'Verify names in the accessibility tree and test keyboard activation.', 'review');
  const links = q('a[href]').filter(visible);
  const unnamed = links.filter(x => !named(x));
  if (unnamed.length) add('link-name', 'Accessibility', 'medium', 'Links may lack accessible names', unnamed, `${unnamed.length} visible links have no detected name.`, 'Provide descriptive link text or an appropriate accessible name.', 'Verify each link has an understandable name.', 'review');
  const placeholders = links.filter(x => x.getAttribute('href').trim() === '#');
  if (placeholders.length) add('placeholder-link', 'Reliability', 'medium', 'Placeholder links need review', placeholders, `${placeholders.length} visible links point to #; scripted behavior was not tested.`, 'Connect navigation to real destinations; use buttons for actions. Preserve valid scripted interactions.', 'Activate each flagged control and confirm the intended behavior.', 'review');
  const unresolvedFragments = links.filter(x => {
    const raw = x.getAttribute('href');
    if (!raw.startsWith('#') || raw.length < 2 || raw.startsWith('#:~:text=')) return false;
    try { const target = decodeURIComponent(raw.slice(1)); return !document.getElementById(target) && !document.getElementsByName(target).length; } catch { return false; }
  });
  if (unresolvedFragments.length) add('fragment', 'Reliability', 'medium', 'Hash navigation — verify manually', unresolvedFragments, `${unresolvedFragments.length} local fragments have no matching DOM id or name. Hash-router behavior was not tested; this does not confirm broken navigation.`, 'Verify intended routing first. Only correct the route or anchor target if navigation fails; preserve working hash-router links.', 'Activate each link with a mouse and keyboard and verify the intended navigation or scrolling.', 'review', false);
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 4) add('overflow', 'Layout', 'medium', 'Page has horizontal overflow', [], `Document width ${doc.scrollWidth}px exceeds viewport width ${doc.clientWidth}px.`, 'Identify oversized containers, fixed widths or unbroken content. Preserve intentionally scrollable regions.', 'Verify there is no unintended page-level horizontal scrolling at mobile and desktop widths.', 'review');
  const positiveTabs = q('[tabindex]').filter(visible).filter(x => Number(x.getAttribute('tabindex')) > 0);
  if (positiveTabs.length) add('tab-order', 'Accessibility', 'medium', 'Positive tabindex changes keyboard order', positiveTabs, `${positiveTabs.length} visible elements use positive tabindex.`, 'Prefer DOM order and tabindex=0 or -1 as appropriate.', 'Tab through the page and verify a logical focus order.');
  const vp = q('meta[name="viewport"]').map(x => x.content).join(',');
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*(?:0(?:\.\d+)?|1(?:\.0+)?)(?=\s|,|$)/i.test(vp)) add('zoom', 'Accessibility', 'medium', 'Viewport metadata restricts zoom', [], 'Viewport metadata requests disabled or limited zoom.', 'Remove zoom restrictions.', 'Verify users can zoom to at least 200%.');
  if (location.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(location.hostname)) add('http', 'Security signals', 'high', 'Page is served over HTTP', [], 'The top-level page uses an unencrypted HTTP URL.', 'Configure HTTPS and redirect HTTP after checking deployment settings.', 'Verify a valid HTTPS connection and redirect.');
  const insecureForms = q('form').filter(x => { try { return new URL(x.action, location.href).protocol === 'http:' && q('input[type="password"]').some(p => p.form === x); } catch { return false; } });
  if (insecureForms.length) add('password-http', 'Security signals', 'high', 'Password form targets HTTP', insecureForms, `${insecureForms.length} forms containing password fields resolve to HTTP actions; submission handlers were not inspected.`, 'Ensure credentials are submitted only over HTTPS, including scripted submission paths.', 'Inspect the real submission request using a test account.', 'review');
  const nav = performance.getEntriesByType('navigation')[0];
  const metrics = {domNodes: q('*').length, navigationLoadMs: nav?.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null};
  if (metrics.domNodes > 1500) add('dom-size', 'Performance', 'low', 'Large DOM needs performance review', [], `${metrics.domNodes} DOM elements were counted; this alone does not prove slow rendering.`, 'Profile rendering before changing code; consider virtualization for long lists.', 'Compare performance traces before and after any optimization.', 'review');
  const rank = {high: 0, medium: 1, low: 2};
  findings.sort((a,b) => rank[a.severity] - rank[b.severity]);
  return {version: '0.1.0', scannedAt: new Date().toISOString(), page: {origin: location.origin, viewport: {width: innerWidth, height: innerHeight}}, metrics, findings, limitations};
}
