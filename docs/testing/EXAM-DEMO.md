# Exam Demo Script (≈ 5 minutes)

## Setup (once, on any PC)
```bash
npm install                     # installs Playwright
# Only if Microsoft Edge is not installed:
#   npx playwright install chromium   and remove  channel: 'msedge'  from playwright.config.js
```

## 1. Show the app (30 s)
```bash
npm run serve                   # then open http://localhost:8080
```
Walk through the tabs: GPS weather, crop recommendation, calculator, diary, **Voice**.
On the Voice tab, pick हिन्दी and tap an example chip, or tap 🎤 and speak. Speech-to-text needs internet. If no Tamil or Telugu voice is installed on the PC, the answer is shown as text; use an Android phone to hear those languages.

## 2. Unit tests – JUnit-style (30 s)
```bash
npm test
```
Say: "54 unit tests covering BVA, EP and decision tables on the calculation engine, plus the voice intent classifier in 4 languages. All pass in about 0.1 seconds."

## 3. Playwright automation – the main demo (2 min)
```bash
npx playwright test --headed --workers=1     # opens a real browser window so the examiner watches it click
npx playwright show-report                   # HTML report with a screenshot of every test
```
Points to make:
- It runs in **real Microsoft Edge**, emulating a **Pixel 5 phone**.
- GPS is **emulated** (`geolocation`), and the weather API is **stubbed** with `page.route()`, so results are repeatable.
- TC-48 types an XSS payload and proves it is not executed.
- TC-51 and TC-52 simulate API failure and GPS denial.
- TC-53 turns the **network off** and the app still loads from the service worker.
- TC-67 – TC-70 **fake the microphone** and check the spoken reply and its language (en-IN, hi-IN, Tamil, Telugu).

Optional debugging demo: `npx playwright test --ui` (time-travel UI).

## 3b. API tests with Postman (1 min)
```bash
npm run test:api          # Newman runs the Postman collection: 8 requests, 39 assertions
```
Or open the **Postman** app → File → Import → `tests/api/open-meteo.postman_collection.json` → **Run collection**.
Points to make: contract checks on every field the app reads, and boundary tests on the API (latitude 90 vs 90.01, forecast days 16 vs 17).

## 3c. Coverage + CI (30 s)
```bash
npm run coverage          # 100 % of the logic lines; the UI part is covered by Playwright
```
On GitHub, open the **Actions** tab: every push runs the tests, and the site only deploys if they pass.

## 4. Show that a test really catches a bug (1 min, strong point)
1. In `app.js`, in `renderLog`, change `${escapeHTML(x.note)}` back to `${x.note}`.
2. Run `npx playwright test -g TC-48`. It **fails**.
3. Undo the change and run again. It **passes**.

## 5. Documents (1 min)
`docs/testing/`:
1. `01-test-plan.md`
2. `02-test-cases.md` (80 automated + 5 manual)
3. `03-bug-report.md` (4 bugs, 3 fixed)
4. `04-rtm.md` (18 requirements, 100 % covered)
5. `05-test-summary.md`
6. `06-blackbox-code-analysis.md` (EP, BVA, decision table, CFG, cyclomatic complexity, taint analysis)
