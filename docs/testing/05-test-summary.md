# Test Summary Report – Smart Agri Assistant v1.2.0

| Item | Value |
|---|---|
| Test cycle | Cycle 1 + regression after fixes |
| Execution date | 10 Nov 2026 |
| Environment | Windows 11, Node.js v24.12.0, Microsoft Edge (headless), Pixel 5 emulation |
| Tools | Playwright 1.56.1 (E2E), Node.js test runner (unit) |

## 1. Execution results

| Suite | Tool | Planned | Executed | Passed | Failed | Time |
|---|---|---|---|---|---|---|
| Unit – logic + voice | Node.js `node:test` | 54 | 54 | 54 | 0 | ≈ 0.1 s |
| E2E – UI incl. voice (black box) | Playwright + Edge | 17 | 17 | 17 | 0 | ≈ 18.5 s |
| **Automated total** | | **71** | **71** | **71** | **0** | |
| Manual – real phone | Android + Chrome | 5 | 0 | – | – | pending |

**Automated pass rate: 100 % (71 / 71).** Raw logs are in `evidence/unit-test-run.txt` and `evidence/e2e-test-run.txt`. The Playwright HTML report, with a screenshot of every test, is in `playwright-report/index.html`.

## 2. Results by technique

| Technique | Test cases |
|---|---|
| Boundary Value Analysis | 22 |
| Equivalence Partitioning | 18 |
| Decision Table | 7 |
| Use case / state transition | 17 |
| Error guessing | 10 |
| Security | 4 |

(Some cases use more than one technique.)

## 3. Defect summary

| ID | Title | Severity | Status | Regression test |
|---|---|---|---|---|
| BUG-001 | Stored XSS in diary note | High | Fixed – verified | TC-40, TC-41, TC-48 |
| BUG-002 | Zero / negative area gives negative fertilizer | Medium | Fixed – verified | TC-46 |
| BUG-003 | Stale service-worker cache blocks updates | Medium | Fixed – verified | TC-53 |
| BUG-004 | March appears in both the Rabi and Zaid labels | Low | Open – deferred | TC-18 |

**Regression proof for BUG-001:** with the fix temporarily removed, TC-48 **failed**, because the note turned into an `<img>` element. With the fix restored, it **passed**. This shows the test genuinely detects the defect.

## 4. Requirement coverage
17 of 17 requirements are covered by automated tests (see `04-rtm.md`).

## 5. Exit criteria check

| Criterion | Target | Actual | Met? |
|---|---|---|---|
| Automated tests executed | 100 % | 100 % (71/71) | ✅ |
| Pass rate | ≥ 95 % | 100 % | ✅ |
| Open Critical / High defects | 0 | 0 | ✅ |
| Fixed defects have regression tests | All | All (3/3) | ✅ |
| Manual device tests | Executed | Pending | ⏳ |

## 6. Conclusion
The automated exit criteria are met. The app's calculation engine, UI flows, error handling, security and offline behaviour work as specified. The only open defect is low severity and cosmetic. The five manual tests on a real phone (install, camera, real GPS, airplane mode, real voice in Hindi) must be run before final sign-off.

## 7. Recommendations
- Run `npm run test:all` in the GitHub Actions workflow before every deploy.
- Bump the `sw.js` cache version on every release.
- Fix BUG-004 (season label) in the next release.
