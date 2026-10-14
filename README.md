# VibeCheck

[![Tests](https://github.com/yasminebek/Vibecheck/actions/workflows/test.yml/badge.svg)](https://github.com/yasminebek/Vibecheck/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-52634e.svg)](LICENSE)

[Install](#install-in-desktop-chrome-or-brave) · [Checks](#what-it-checks) · [Privacy](#privacy) · [Tests](#develop-and-test) · [Contribute](CONTRIBUTING.md)

**Turn a running website into an actionable AI fix prompt.**

A small, local-first Chrome / Brave extension by **Yasmine Bekhiche**. Open a deployed product, scan the current page, review the findings, then paste the generated prompt into your coding agent with access to the source repository.

Version 0.1.0 · MIT licensed · No account · No API key · No runtime dependencies

## The problem it solves

Shipping a page is easier than knowing what needs fixing. VibeCheck bridges the gap between observable problems in a deployed interface and an actionable task for a coding agent. Each finding carries evidence and acceptance checks, so the next step is specific and verifiable.

**Inspect a page → select findings → review the prompt → fix in your repository → verify.**

## Engineering overview

| Component | Responsibility |
| --- | --- |
| [audit.js](extension/audit.js) | Collects observations from the current page into structured findings. |
| [prompt.js](extension/prompt.js) | Converts findings into a deterministic repair prompt without calling an AI service. |
| [Popup](extension/popup.html) | Lets the user select findings, add context, and copy or export the result. |
| [Tests](tests/) | Unit, browser-fixture and real-extension integration coverage. |
| [CI](.github/workflows/test.yml) | Automated validation through GitHub Actions. |

Built with JavaScript and a Manifest V3 browser extension. Runtime analysis stays local; Node.js, jsdom and Playwright support development and testing.

## Install in desktop Chrome or Brave

1. Download and extract this project.
2. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
3. Enable **Developer mode**, choose **Load unpacked**, then select the **extension** folder (the folder containing `manifest.json`).
4. Open the website you want to inspect, click VibeCheck in the extensions menu, and choose **Analyze current page**.
5. Select relevant findings, optionally describe the product or affected route, review/edit the generated prompt, and click **Copy prompt**.
6. Paste into your coding agent and provide the correct repository. Verify its changes before deploying.

This is an unpacked developer release, not a Chrome Web Store listing. Desktop browsers are the target. Browser settings pages, store pages and some other protected pages cannot be inspected.

## What it checks

| Area | Observations |
| --- | --- |
| Accessibility basics | Missing document language, image alternatives, likely unnamed fields/buttons/links, missing main heading, positive tabindex, zoom restrictions |
| Reliability | Failed rendered images, placeholder links, fragment links without DOM targets |
| Layout | Missing device-width viewport and page-level horizontal overflow |
| Discovery | Missing page title and meta description |
| Security signals | HTTP page and password forms whose HTML action resolves to HTTP |
| Performance signal | DOM element count, large DOM review, navigation load timing when available |

Findings include severity, evidence, structural selectors, suggested fixes and acceptance checks. Up to five example selectors are included per finding type, with the total affected count. “Review” means a heuristic that must be confirmed. Severity reflects likely impact, not a calibrated risk score. No overall quality score is invented.

**Hash navigation — verify manually** flags local fragments without a matching DOM target. A hash router may handle them correctly, so these findings are unchecked and excluded from the fix prompt by default. Test navigation first, then select the finding if needed. The full JSON report still includes it.

The prompt is generated deterministically, without an LLM. You choose where to send it. It asks the coding agent to reproduce observations, inspect the source, preserve behavior, fix confirmed issues and report actual verification.

## Scope and limitations

- One main-frame DOM snapshot, at the current viewport. Rescan after route changes and significant interactions. Results disappear when the popup closes.
- No iframe or shadow-root coverage; no repository, backend, console history, response headers or network failure audit.
- No link crawling, automated clicks, form submissions, login/checkout testing or destructive interactions.
- Accessible-name checks are approximate, not a complete implementation of the accessible-name algorithm. No color contrast analysis or WCAG compliance certification.
- Performance timing is contextual data, not Lighthouse or Core Web Vitals. No diagnosis from timing alone.
- HTTP form actions can be overridden by script. Hash links can be handled by routers. Missing metadata may be irrelevant on private app screens.
- A clean report does **not** mean the website is bug-free, production-ready or secure. The tool does not determine whether a site was AI-generated.
- On very large DOMs, synchronous inspection can briefly affect responsiveness.

## Privacy

All analysis runs locally after your click. No analytics, remote scripts, AI requests, cookies, storage reads or automatic uploads. The manifest requests only `activeTab` and `scripting` for temporary, user-initiated access.

Reports include origin, timestamp, viewport, structural DOM selectors, aggregate measurements and predefined finding text. They exclude URL paths/query strings/fragments, page text, IDs/classes and field values. The scanner consults text to determine whether accessible names exist but does not export that text. Origins can still identify an internal service; redact them if needed. Context you type is included verbatim (up to 4,000 characters) in the prompt. Review everything before sharing externally. JSON export contains the complete scan, including unselected findings; it excludes your added product context.

Sources for the extension permission design:
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/extensions/reference/api/scripting

## Develop and test

No build step is needed. Edit files under `extension/`, reload the extension in your browser, then reopen the popup.

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
```

Node 22+ recommended. Tests use Node's test runner and Playwright Chromium. Browser tests exercise the real audit on broken and healthy fixtures and the UI with a stubbed Chrome API. They verify privacy exclusions, selection, context regeneration, downloads and restricted-page errors. The separate real-extension test below exercises the actual action popup and browser permissions. Brave-specific behavior is not yet verified.

### Validation of this initial delivery

Eight unit tests and the Playwright browser suite passed. A headed Chromium integration test also passed on [GitHub Actions](https://github.com/yasminebek/Vibecheck/actions/runs/38351788413): it opened the real extension action popup, obtained the normal activeTab grant, injected the scanner into a demo page, verified expected findings, and copied/pasted the generated prompt through the OS clipboard.

The integration test adds a keyboard shortcut only to a temporary copy of the extension to invoke its existing action. It does not add host permissions or stub Chrome APIs. It uses CDP to attach to the real popup because Playwright does not automatically expose that popup as a page in this setup.

On Linux with Xvfb and xdotool installed, run:

```sh
xvfb-run --auto-servernum node tests/extension.mjs
```

These are controlled fixture tests in Chromium, not a certification for every website or a manual Brave test. This remains an initial beta.

Manual release checks:
- Load unpacked in desktop Chrome and Brave without manifest errors.
- Scan a normal HTTP(S) page via the toolbar; confirm actual activeTab permission and script injection.
- Copy the prompt, paste into a text editor, and verify clipboard contents.
- Scan an SPA before and after navigation; confirm fresh results.
- Try a protected browser/store page and verify a useful error.
- Check keyboard access and readability at browser zoom.

## Source and contributions

Repository: https://github.com/yasminebek/Vibecheck

Download the source with **Code → Download ZIP**, or clone:

```sh
git clone https://github.com/yasminebek/Vibecheck.git
cd Vibecheck
```

A GitHub Actions workflow runs the unit and browser test suites on pushes and pull requests. The MIT license grants open-source reuse.

## Roadmap

- More complete accessibility analysis with a bundled, reviewed engine.
- Optional session recording for runtime errors and failing requests, with explicit permissions and redaction.
- Responsive multi-viewport and user-flow testing through a separate runner.
- Optional screenshot-assisted review with clear opt-in and provider configuration.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
