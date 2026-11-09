# Test Plan – Smart Agri Assistant (PWA)

| Item | Detail |
|---|---|
| Project | Smart Agri Assistant – offline-capable crop advisor PWA |
| Version under test | 1.2.0 (`app.js`, `index.html`, `sw.js`) |
| Document | Test Plan (structure based on IEEE 829) |
| Date | 10 Nov 2026 |
| Prepared by | ____________________ |

## 1. Objective
Verify that every functional module of the app produces correct results, handles invalid input and failures safely, is free of the injection defect found during code review, and still works offline. Every test must run automatically with one command.

## 2. Scope
**In scope**
| Module | Requirement IDs |
|---|---|
| Crop recommender (scoring engine) | REQ-01 – REQ-03 |
| Season auto-detection | REQ-04 |
| Irrigation calculator | REQ-05 |
| Fertilizer calculator | REQ-06, REQ-07 |
| Weather advice rules | REQ-08 |
| GPS + weather fetch, error handling | REQ-09, REQ-10 |
| Leaf health scan | REQ-11 |
| Farm diary + CSV export | REQ-12, REQ-13 |
| Security (output encoding) | REQ-14 |
| Offline operation (service worker) | REQ-15 |
| Multilingual voice assistant (en / hi / ta / te) | REQ-16, REQ-17 |

**Out of scope:** the accuracy of the browser's speech-to-text service (Google / Microsoft), accuracy of agronomic constants (taken from standard tables), the Open-Meteo service itself, load/performance testing, and iOS Safari.

## 3. Test Approach
| Level | Technique | Tool |
|---|---|---|
| Unit (logic in `app.js`) | Boundary Value Analysis, Equivalence Partitioning, Decision Table | Node.js built-in test runner (`node:test`, xUnit / JUnit style) |
| System / E2E (black box, via the UI) | Use-case and state-transition testing, error guessing | **Playwright** 1.56.1, Microsoft Edge, Pixel 5 mobile emulation |
| Static (white box) | Control-flow graph, cyclomatic complexity, source-to-sink taint analysis | Manual code review |
| Manual on device | Exploratory testing of real sensors | Android phone + Chrome |

External dependencies are isolated so results are repeatable: GPS is fixed to 27.4924, 77.6737 with Playwright's `geolocation` option, and the weather API is stubbed with `page.route()`.

## 4. Test Environment
| Item | Value |
|---|---|
| OS | Windows 11 Home 10.0.26200 |
| Runtime | Node.js v24.12.0, Python 3.11.9 (static server on `localhost:8080`) |
| Browser | Microsoft Edge (Chromium), headless, Pixel 5 viewport (393×851) |
| Device (manual) | Android smartphone, Chrome |

## 5. Entry Criteria
- Source code is complete and the app loads on `localhost:8080`.
- `npm install` has completed.
- The test cases are reviewed and mapped to requirements in the RTM.

## 6. Exit Criteria
- 100 % of the automated test cases executed.
- At least 95 % pass, with **no open Critical or High defects**.
- Every fixed defect has a regression test that passes.

## 7. Suspension / Resumption
Testing is suspended if the app fails to load or more than 30 % of tests fail. It resumes after the blocking defect is fixed.

## 8. Deliverables
1. Test Plan (this document)
2. Test Cases – `02-test-cases.md`
3. Bug Report – `03-bug-report.md`
4. Requirements Traceability Matrix – `04-rtm.md`
5. Test Summary Report – `05-test-summary.md`
6. Black-box and code analysis – `06-blackbox-code-analysis.md`
7. Automation scripts – `tests/unit/logic.test.js`, `tests/e2e/app.spec.js`, `playwright.config.js`
8. Execution evidence – `docs/testing/evidence/`, Playwright HTML report (`playwright-report/`)

## 9. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Live weather changes between runs | Flaky assertions | Stub the API with `page.route()` |
| GPS unavailable on a PC | Tests cannot run | Emulate geolocation in Playwright |
| No microphone on the test PC; speech output differs by device | Voice tests cannot run | Replace `SpeechRecognition` with a fake that returns a fixed sentence, and record `speechSynthesis.speak()` calls |
| Service worker caches an old build | Users never receive fixes | Version the cache name (see BUG-003) |
| Browser download blocked on the exam PC | Tool cannot run | Use the installed Edge (`channel: 'msedge'`) |

## 10. Schedule
| Activity | Status |
|---|---|
| Requirement analysis and test design | Done |
| Unit test automation | Done |
| E2E automation (Playwright) | Done |
| Defect fixing and regression | Done |
| Manual device testing | Pending (see test summary) |
| Reporting | Done |
