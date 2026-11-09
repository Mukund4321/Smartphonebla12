# Test Summary Report – Smart Agri Assistant v1.2.0

| Item | Value |
|---|---|
| Test cycle | Cycle 1 + regression after fixes |
| Execution date | 10 Nov 2026 |
| Environment | Windows 11, Node.js v24.12.0, Microsoft Edge (headless), Pixel 5 emulation |
| Tools | Playwright 1.56.1 (E2E), Node.js test runner + coverage (unit), Postman / Newman 6.2.1 (API), GitHub Actions (CI) |

## 1. Execution results

| Suite | Tool | Planned | Executed | Passed | Failed | Time |
|---|---|---|---|---|---|---|
| Unit – logic + voice | Node.js `node:test` | 55 | 55 | 55 | 0 | ≈ 0.1 s |
| E2E – UI incl. voice (black box) | Playwright + Edge | 17 | 17 | 17 | 0 | ≈ 33 s |
| API – weather service contract | Postman / Newman | 8 (39 assertions) | 8 | 8 | 0 | ≈ 2.6 s |
| **Automated total** | | **80** | **80** | **80** | **0** | |
| Manual – real phone | Android + Chrome | 5 | 0 | – | – | pending |

**Automated pass rate: 100 % (80 / 80).** Raw logs are in `evidence/unit-test-run.txt`, `evidence/e2e-test-run.txt`, `evidence/api-test-run.txt` and `evidence/coverage-report.txt`. The Playwright HTML report, with a screenshot of every test, is in `playwright-report/index.html`.

## 2. Results by technique

| Technique | Test cases |
|---|---|
| Boundary Value Analysis | 27 |
| Equivalence Partitioning | 19 |
| Decision Table | 7 |
| Use case / state transition | 17 |
| Error guessing | 11 |
| Security | 4 |
| API contract | 2 |

(Some cases use more than one technique.)

## 2a. Code coverage (`npm run coverage`)

| Scope | Line % | Branch % | Notes |
|---|---|---|---|
| `app.js` – calculation & voice logic (lines 1–225) | **100 %** | – | Every line executed by unit tests |
| `app.js` – whole file | 55.8 % | 89.8 % | Lines 226–405 are browser-only UI code (DOM, GPS, camera, mic), which Node cannot run. That part is covered by the 17 Playwright E2E tests instead. |

The first coverage run showed line 89 (the leaf scanner's "Mixed colours" message) was never executed. TC-72 was added to cover it.

## 2b. Continuous integration
`.github/workflows/pages.yml` runs on every push and pull request: unit tests + coverage, then Playwright E2E tests (Chromium on Ubuntu), then the Postman API tests. **The GitHub Pages deploy only runs if the unit and E2E tests pass.** The API job is reported separately and does not block the deploy, because it depends on a live third-party service. The Playwright HTML report and Newman JUnit results are uploaded as build artifacts.

## 3. Defect summary

| ID | Title | Severity | Status | Regression test |
|---|---|---|---|---|
| BUG-001 | Stored XSS in diary note | High | Fixed – verified | TC-40, TC-41, TC-48 |
| BUG-002 | Zero / negative area gives negative fertilizer | Medium | Fixed – verified | TC-46 |
| BUG-003 | Stale service-worker cache blocks updates | Medium | Fixed – verified | TC-53 |
| BUG-004 | March appears in both the Rabi and Zaid labels | Low | Open – deferred | TC-18 |

**Regression proof for BUG-001:** with the fix temporarily removed, TC-48 **failed**, because the note turned into an `<img>` element. With the fix restored, it **passed**. This shows the test genuinely detects the defect.

## 4. Requirement coverage
18 of 18 requirements are covered by automated tests (see `04-rtm.md`).

## 5. Exit criteria check

| Criterion | Target | Actual | Met? |
|---|---|---|---|
| Automated tests executed | 100 % | 100 % (80/80) | ✅ |
| Pass rate | ≥ 95 % | 100 % | ✅ |
| Open Critical / High defects | 0 | 0 | ✅ |
| Fixed defects have regression tests | All | All (3/3) | ✅ |
| Manual device tests | Executed | Pending | ⏳ |

## 6. Conclusion
The automated exit criteria are met. The app's calculation engine, UI flows, error handling, security and offline behaviour work as specified. The only open defect is low severity and cosmetic. The five manual tests on a real phone (install, camera, real GPS, airplane mode, real voice in Hindi) must be run before final sign-off.

## 7. Recommendations
- Bump the `sw.js` cache version on every release.
- Fix BUG-004 (season label) in the next release.
