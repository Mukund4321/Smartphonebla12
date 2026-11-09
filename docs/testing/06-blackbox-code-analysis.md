# Black-Box Testing & Code Analysis

## Part A – Black-box test design

### A1. Equivalence Partitioning (EP)

| Input | Valid partitions | Invalid / edge partitions | Tests |
|---|---|---|---|
| Soil pH (crop range, Rice 5.5–7.0) | Inside range → 20 pts | Below range → partial (20 − 10·d) · Far outside → 0 | TC-07, TC-08, TC-09 |
| Water availability vs crop need | ≥ need → 10 · 1 level short → 5 | 2 levels short → 0 | TC-10, TC-11, TC-12 |
| Field area (acres) | > 0 | = 0 · < 0 (rejected, BUG-002) | TC-23, TC-45, TC-46 |
| Leaf image pixels | Green · Yellow · Brown | Background only (white / dark / grey) → `null` | TC-35 – TC-39 |
| Diary note text | Plain text | Text containing HTML / script (must be escaped) | TC-47, TC-48 |
| Voice question language | English · Hindi · Tamil · Telugu (one partition each) | Empty / null / gibberish → "unknown" · unsupported language code → English | TC-54 – TC-59, TC-66 |
| Speech support in the browser | SpeechRecognition available | Not available → mic disabled, typing still works | TC-67, TC-70 |
| External services | GPS OK, API OK | GPS denied · API HTTP 500 · no network | TC-43, TC-51, TC-52, TC-53 |

### A2. Boundary Value Analysis (BVA)

**Temperature for Rice (ideal 20–35 °C):**

| Point | min − 1 | min | nominal | max | max + 1 | far |
|---|---|---|---|---|---|---|
| °C | 19 | 20 | 27 | 35 | 36 | 0 |
| Expected score | 95 | 100 | 100 | 100 | 95 | 70 |
| Test | TC-01 | TC-02 | TC-03 | TC-04 | TC-05 | TC-06 |

**Irrigation "zero point":** need = max(0, ET₀·Kc − 0.8·rain). With ET₀ = 5 and Kc = 1.1, the need reaches 0 at rain = 5.5 ÷ 0.8 = **6.875 mm**.

| Rain (mm) | 0 | 6.8 | 6.875 | 50 |
|---|---|---|---|---|
| Need (mm/day) | 5.5 | 0.06 (> 0) | 0 | 0 (clamped) |
| Test | TC-19 | TC-20 | TC-21 | TC-22 |

**Advice thresholds:** wind 19.9 / 20 km/h (TC-30 / TC-29) · rain 9.9 / 10 mm (TC-34 / TC-27) · frost 5 / 5.1 °C (TC-32) · humidity 85 % (TC-31) · heat 38 °C (TC-33).

**Season month boundaries:** 2→3, 5→6, 10→11 (TC-16 – TC-18).

**Weather API request parameters (Postman):**

| Parameter | Valid boundary | Invalid boundary | Tests |
|---|---|---|---|
| latitude (−90…90) | 90 → 200 | 90.01 → 400 | TC-75, TC-76 |
| longitude (−180…180) | – | 180.01 → 400 | TC-77 |
| forecast_days (0…16) | 16 → 200 | 17 → 400 | TC-79, TC-80 |
| latitude present? | present → 200 | missing → 400 | TC-73, TC-78 |

### A3. Decision Table – weather advice (`adviceFrom`)

Conditions: C1 rain ≥ 10 mm · C2 rain < 1 mm and temp ≥ 32 °C · C3 wind ≥ 20 km/h · C4 humidity ≥ 85 % and 20 ≤ temp ≤ 30 · C5 temp ≤ 5 °C · C6 temp ≥ 38 °C

| Rule | C1 | C2 | C3 | C4 | C5 | C6 | Actions shown | Test |
|---|---|---|---|---|---|---|---|---|
| R1 | T | – | F | F | F | F | Skip irrigation/spray (bad) + Spray OK | TC-27 |
| R2 | F | T | F | F | F | F | Hot & dry, irrigate early (mid) + Spray OK | TC-28 |
| R3 | F | F | T | F | F | F | Avoid pesticide spraying (bad) | TC-29 |
| R4 | F | F | F | T | F | F | Fungal risk (mid) + Spray OK | TC-31 |
| R5 | F | F | F | F | T | F | Frost risk (bad) + Spray OK | TC-32 |
| R6 | F | T | F | F | F | T | Hot & dry + Heat stress (bad) + Spray OK | TC-33 |

C1 and C2 are exclusive (`if / else if`). C5 and C6 cannot both be true.

### A4. Error guessing
Typed negative area (BUG-002), HTML in a text field (BUG-001), weather API down (TC-51), GPS permission denied (TC-52), loss of network (TC-53), and a photo with no leaf in it (TC-38).

---

## Part B – White-box code analysis

### B1. Control-flow graph and cyclomatic complexity – `scoreCrop()` (app.js:32)

Decision nodes:
1. `temp >= t0 && temp <= t1` (temperature in range?)
2. `ph >= ph0 && ph <= ph1` (pH in range?)
3. `soils.includes(soil)`
4. `seasons.includes(season)`
5. `c.water <= w`

```
        [entry]
           │
       (D1 temp ok?) ──F──► [partial temp]
           │T                   │
       [+30] ◄──────────────────┘
           │
       (D2 pH ok?) ──F──► [partial pH]
           │T               │
       [+20] ◄──────────────┘
           │
       (D3 soil?) ──T──► [+20]
           │F             │
           ◄──────────────┘
       (D4 season?) ──T──► [+20]
           │F               │
           ◄────────────────┘
       (D5 water?) ──F──► [partial water]
           │T                │
       [+10] ◄───────────────┘
           │
        [return]
```

- **V(G) = P + 1 = 5 + 1 = 6** (counting predicate `if` statements)
- Counting each atomic condition in the two `&&` expressions gives P = 7, so **V(G) = 8** (condition-level / MC-DC view)

**Basis paths** (each flips one decision from the all-true baseline):

| Path | Flipped decision | Covered by |
|---|---|---|
| P1 | none (all true) | TC-02 / TC-13 |
| P2 | D1 false (temperature out) | TC-01, TC-05 |
| P3 | D2 false (pH out) | TC-08 |
| P4 | D3 false (soil mismatch) | TC-15 (sandy soil) |
| P5 | D4 false (season mismatch) | TC-15 (zaid for Rice) |
| P6 | D5 false (water short) | TC-11, TC-12 |

For the condition-level view, TC-01 hits `temp < t0` and TC-05 hits `temp > t1`. TC-08 hits `ph < ph0` and TC-09 hits `ph > ph1`. All 8 condition outcomes are covered.

**`adviceFrom()`** has 6 `if` decision points, so V(G) = 7. All 6 rules are covered by TC-27 – TC-34.

Both functions score below 10, the commonly used threshold for moderate risk, so they are maintainable and fully testable.

### B2. Data-flow / taint analysis (security)

| Source (untrusted) | Path | Sink | Before | After |
|---|---|---|---|---|
| `#logNote` input (user) | `btnLog` → `localStorage['log']` → `renderLog()` | `logList.innerHTML` | **Unsanitised → stored XSS (BUG-001)** | `escapeHTML()` applied |
| `#logType` select | same path | `logList.innerHTML` | Fixed option list, but editable via DevTools or `localStorage` | `escapeHTML()` applied |
| Open-Meteo JSON (network) | `fetchWeather` → `renderWeather` | `weather.innerHTML` | Numeric fields only; the trusted HTTPS API is the source | Accepted risk (low) |
| Leaf image file | Canvas `getImageData` | Numeric analysis only | No sink | Safe |
| Diary export | `q()` quotes every CSV field and doubles `"` | Downloaded file | CSV structure is safe | Safe |
| Voice transcript / typed question | `answer()` | `voiceHeard.textContent`, `voiceReply.textContent` | Written with `textContent`, never `innerHTML` | Safe (TC-71) |

The fix is verified by TC-40, TC-41 and TC-48.

### B3. Code coverage
Measured with Node.js built-in coverage (`npm run coverage`, output in `evidence/coverage-report.txt`).
- **Logic section of `app.js` (lines 1–225): 100 % of lines executed.**
- Whole file: 55.8 % lines / 89.8 % branches. The uncovered lines 226–405 are the browser-only UI code, which is exercised by the Playwright E2E suite instead.
- The coverage report found one untested branch (line 89, "Mixed colours" note). TC-72 now covers it.

### B4. Other review findings
- **Stale cache:** `sw.js` used a fixed cache name, so updates never reached users (BUG-003, fixed).
- **Input validation:** the HTML `min` attribute does not stop typed values. Validation must happen in JS (BUG-002, fixed).
- **Testability:** the pure logic is separated from the DOM code and exported through `module.exports`, which allows fast unit tests in Node without a browser.
