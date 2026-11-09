# Test Cases – Smart Agri Assistant

**Totals:** 71 automated (54 unit + 17 Playwright E2E), plus 5 manual cases on a real phone.
**Technique key:** BVA = Boundary Value Analysis · EP = Equivalence Partitioning · DT = Decision Table · UC = Use case · ST = State transition · EG = Error guessing · SEC = Security

The "Actual" column records the result of the run on 10 Nov 2026. Raw output is in `evidence/`.

## A. Unit tests – `tests/unit/logic.test.js` (Node.js test runner)

Default input for crop scoring: Rice, clay soil, pH 6.5, kharif, high water (all other factors give full points, so only the factor under test changes the score).

| ID | Req | Tech | Description / Input | Expected | Actual |
|---|---|---|---|---|---|
| TC-01 | REQ-01 | BVA | Rice at 19 °C (min − 1) | 95 | Pass |
| TC-02 | REQ-01 | BVA | Rice at 20 °C (min) | 100 | Pass |
| TC-03 | REQ-01 | BVA | Rice at 27 °C (nominal) | 100 | Pass |
| TC-04 | REQ-01 | BVA | Rice at 35 °C (max) | 100 | Pass |
| TC-05 | REQ-01 | BVA | Rice at 36 °C (max + 1) | 95 | Pass |
| TC-06 | REQ-01 | BVA | Rice at 0 °C (far outside) | 70 (temperature points floor at 0) | Pass |
| TC-07 | REQ-01 | EP | pH 6.5, valid partition | 100 | Pass |
| TC-08 | REQ-01 | EP | pH 5.0, below range | 95 (15 of 20 pH points) | Pass |
| TC-09 | REQ-01 | EP | pH 9.0, far above range | 80 (0 pH points) | Pass |
| TC-10 | REQ-01 | EP | Water high | 100 | Pass |
| TC-11 | REQ-01 | EP | Water medium | 95 | Pass |
| TC-12 | REQ-01 | EP | Water low | 90 | Pass |
| TC-13 | REQ-02 | UC | Recommend for clay / 6.5 / kharif / high / 27 °C | Rice ranked 1st, 100/100 | Pass |
| TC-14 | REQ-02 | UC | Recommend for loam / 6.8 / rabi / med / 18 °C | Exactly 4 results, descending | Pass |
| TC-15 | REQ-03 | BVA | All 12 crops × temp {−20, 60} × pH {4, 9} | Every score within 0–100 | Pass |
| TC-16 | REQ-04 | BVA | Month 5 → 6 | zaid → kharif | Pass |
| TC-17 | REQ-04 | BVA | Month 10 → 11 | kharif → rabi | Pass |
| TC-18 | REQ-04 | BVA | Month 2 → 3 | rabi → zaid | Pass |
| TC-19 | REQ-05 | EP | ET₀ 5, Kc 1.1, rain 0, 1 acre | 5.5 mm/day, ≈ 22,258 L | Pass |
| TC-20 | REQ-05 | BVA | Rain 6.8 mm (just below the zero point) | Need > 0 | Pass |
| TC-21 | REQ-05 | BVA | Rain 6.875 mm (5.5 ÷ 0.8, the zero point) | Need = 0 | Pass |
| TC-22 | REQ-05 | BVA | Rain 50 mm | Need = 0, never negative | Pass |
| TC-23 | REQ-05 | EP | 2 acres vs 1 acre | Litres exactly double | Pass |
| TC-24 | REQ-06 | EP | Wheat, 1 acre | DAP 52.17, Urea 83.93, MOP 26.67 kg | Pass |
| TC-25 | REQ-06 | BVA | Chickpea (K target = 0) | MOP 0 kg | Pass |
| TC-26 | REQ-06 | EG | Groundnut (DAP already covers N) | Urea ≥ 0 | Pass |
| TC-27 | REQ-08 | DT | Rule R1: rain 12 mm | "skip irrigation" (bad) | Pass |
| TC-28 | REQ-08 | DT | Rule R2: 33 °C, 0 mm rain | "Hot & dry" (mid) | Pass |
| TC-29 | REQ-08 | DT/BVA | Rule R3: wind 20 km/h | "avoid pesticide" (bad) | Pass |
| TC-30 | REQ-08 | DT/BVA | Rule R3: wind 19.9 km/h | "calm" (good) | Pass |
| TC-31 | REQ-08 | DT/BVA | Rule R4: humidity 85 %, 25 °C | "fungal" (mid) | Pass |
| TC-32 | REQ-08 | DT/BVA | Rule R5: 5 °C vs 5.1 °C | Frost alert only at 5 °C | Pass |
| TC-33 | REQ-08 | DT/BVA | Rule R6: 38 °C | "Heat stress" (bad) | Pass |
| TC-34 | REQ-08 | BVA | Rain 9.9 mm | No skip-irrigation alert | Pass |
| TC-35 | REQ-11 | EP | 100 % green pixels | Health 100, "healthy" | Pass |
| TC-36 | REQ-11 | EP | 100 % yellow pixels | Yellow 100 %, nitrogen advice | Pass |
| TC-37 | REQ-11 | EP/BVA | 100 % brown pixels | Health clamped to 0, fungal advice | Pass |
| TC-38 | REQ-11 | EG | White background only | `null` (no plant tissue) | Pass |
| TC-39 | REQ-11 | EP | 50 % green + 50 % yellow | Health 50 | Pass |
| TC-40 | REQ-14 | SEC | `<img src=x onerror=alert(1)>` | `&lt;img src=x onerror=alert(1)&gt;` | Pass |
| TC-41 | REQ-14 | SEC | Quotes, `&`, `null`, `undefined` | All escaped; null and undefined → "" | Pass |

## B. End-to-end tests – `tests/e2e/app.spec.js` (Playwright, Edge, Pixel 5)

Common precondition: app served on `localhost:8080`, GPS emulated at 27.4924, 77.6737, weather API stubbed (33 °C, 40 % RH, wind 25 km/h, rain 0 mm, ET₀ 5).

| ID | Req | Tech | Steps | Expected | Actual |
|---|---|---|---|---|---|
| TC-42 | REQ-15 | UC | Open `/` | Title "Smart Agri Assistant", status "online", 6 nav tabs | Pass |
| TC-43 | REQ-09, REQ-08 | UC | Tap **Use my GPS location** | Coordinates shown, 4 weather stats incl. 33°C, "Hot & dry" + "avoid pesticide" advice, 7 forecast days | Pass |
| TC-44 | REQ-02 | UC | Crops tab → clay, kharif, high water, 27 °C → Recommend | 4 results, first is "1. Rice — 100/100" | Pass |
| TC-45 | REQ-05, REQ-06 | UC | Calc tab → Wheat, 2 acres → Calculate | Urea 168 kg, DAP 104 kg, MOP 53 kg, 5.5 mm/day | Pass |
| TC-46 | REQ-07 | BVA/EG | Calc → area 0, then −2 → Calculate | Error "greater than 0", no fertilizer result | Pass |
| TC-47 | REQ-12 | ST | Diary → Fertilizer, note → Save → reload | Entry shows type, note, GPS "27.492, 77.674"; persists after reload | Pass |
| TC-48 | REQ-14 | SEC | Diary note `<img src=x onerror="alert(1)">` → Save | Shown as literal text, no `<img>` element, no alert dialog | Pass |
| TC-49 | REQ-13 | UC | Save entry → Export CSV | File `farm-diary.csv`, header `time,type,note,lat,lon`, contains the note | Pass |
| TC-50 | REQ-11 | UC | Leaf tab → upload a green PNG | Canvas visible, "Health score: 100/100", "Leaf looks healthy" | Pass |
| TC-51 | REQ-10 | EG | Weather API returns HTTP 500 → tap GPS | "weather unavailable" message, no crash | Pass |
| TC-52 | REQ-10 | EG | Geolocation denied → tap GPS | "GPS failed: User denied Geolocation" | Pass |
| TC-53 | REQ-15 | ST | Load once → network offline → reload | App loads from service-worker cache, status "offline", 6 tabs | Pass |

## D. Voice assistant – unit tests (`tests/unit/logic.test.js`)

| ID | Req | Tech | Input | Expected | Actual |
|---|---|---|---|---|---|
| TC-54 | REQ-16 | EP | English: "What is the weather?", "Recommend crops", "How much water for rice?", "Fertilizer for wheat", "my leaf has spots" | weather / crop / water+Rice / fertilizer+Wheat / leaf | Pass |
| TC-55 | REQ-16 | EP | Hindi: "आज मौसम कैसा है?", "कौन सी फसल लगाऊं?", "धान को कितना पानी चाहिए?", "गेहूं के लिए खाद बताओ" | weather / crop / water+Rice / fertilizer+Wheat | Pass |
| TC-56 | REQ-16 | EP | Tamil: "இன்று வானிலை எப்படி?", "எந்த பயிர் பயிரிடலாம்?", "நெல்லுக்கு எவ்வளவு தண்ணீர்?", "கோதுமைக்கு உரம் எவ்வளவு?" | weather / crop / water+Rice / fertilizer+Wheat | Pass |
| TC-57 | REQ-16 | EP | Telugu: "ఈరోజు వాతావరణం ఎలా ఉంది?", "ఏ పంట వేయాలి?", "వరికి ఎంత నీరు కావాలి?", "గోధుమకు ఎరువు ఎంత?" | weather / crop / water+Rice / fertilizer+Wheat | Pass |
| TC-58 | REQ-16 | EG | "వేరుశనగకు ఎరువు" vs "శనగకు ఎరువు" (one crop name contains the other) | Groundnut vs Chickpea | Pass |
| TC-59 | REQ-16 | EP | "", null, undefined, "hello there", "12345" (invalid partition) | intent "unknown" | Pass |
| TC-60 | REQ-16 | EG | "WEATHER TODAY" (upper case) | weather | Pass |
| TC-61 | REQ-16 | EG | Hindi weather question with no GPS fix | Asks the user to tap the GPS button first | Pass |
| TC-62 | REQ-16 | UC | English weather, 33.4 °C, wind 25 km/h | "Temperature 33 degrees" + "do not spray" | Pass |
| TC-63 | REQ-16 | UC | Telugu fertilizer for wheat | గోధుమ, urea 84, DAP 52, MOP 27 (same as `fertilizer()`) | Pass |
| TC-64 | REQ-16 | UC | Tamil water for rice, ET₀ 5 | நெல், 5.5 mm, 22258 L (same as `irrigation()`) | Pass |
| TC-65 | REQ-16 | UC | Hindi crop question, rabi season | Hindi names of the top 3 crops from `recommend()` + "रबी" | Pass |
| TC-66 | REQ-16 | EG | Unsupported language code `fr-FR` | Falls back to English | Pass |

## E. Voice assistant – Playwright E2E (`tests/e2e/app.spec.js`)

The microphone is faked: `SpeechRecognition` is replaced by a stub that "hears" a fixed sentence, and every `speechSynthesis.speak()` call is recorded so the test can check what was spoken and in which language.

| ID | Req | Tech | Steps | Expected | Actual |
|---|---|---|---|---|---|
| TC-67 | REQ-16 | UC | Get GPS → Voice tab → tap mic → hears "What is the weather?" | Transcript shown; reply "Temperature 33 degrees… do not spray"; spoken with `en-IN` | Pass |
| TC-68 | REQ-16 | UC | Voice tab → हिन्दी → tap mic → hears "धान को कितना पानी चाहिए?" | Reply "चावल को रोज़ लगभग 7.7 मिलीमीटर पानी…"; spoken with `hi-IN` | Pass |
| TC-69 | REQ-16 | UC | Tamil → tap the fertilizer example chip; Telugu → tap the fertilizer chip | "யூரியா 84 கிலோ" then "యూరియా 84 కిలోలు" | Pass |
| TC-70 | REQ-17 | EG | Browser with no SpeechRecognition → type "Fertilizer for wheat" → Ask | Mic disabled, "not supported" message, typed answer "urea 84 kilograms" | Pass |
| TC-71 | REQ-14 | SEC | Type `<img src=x onerror="alert(1)">` → Ask | Shown as text, no `<img>` element, no dialog | Pass |

## C. Manual test cases (real smartphone)

| ID | Req | Steps | Expected | Actual |
|---|---|---|---|---|
| MT-01 | REQ-15 | Open the live URL in Android Chrome → menu → Add to Home screen | Icon on home screen; opens full screen without the browser bar | Not run yet |
| MT-02 | REQ-11 | Leaf tab → camera opens → photograph a real leaf | Photo analysed and score shown; no network request is made | Not run yet |
| MT-03 | REQ-09 | Outdoors, tap GPS | Real coordinates, accuracy under 50 m, live weather | Not run yet |
| MT-04 | REQ-15 | Turn on airplane mode → open the app from the home screen | App opens, status "offline", diary still works | Not run yet |
| MT-05 | REQ-16 | Android Chrome, online → Voice tab → हिन्दी → tap mic → say "आज मौसम कैसा है" | Speech recognised, Hindi answer shown and spoken aloud | Not run yet |
