# Requirements Traceability Matrix (RTM)

## Forward traceability (requirement → tests)

| Req ID | Requirement | Test cases | Bugs | Status |
|---|---|---|---|---|
| REQ-01 | Score each crop 0–100 from temperature, pH, soil, season and water | TC-01 – TC-12 | – | Pass |
| REQ-02 | Show the top 4 crops, sorted by score | TC-13, TC-14, TC-44 | – | Pass |
| REQ-03 | Scores never fall outside 0–100 for any input | TC-15 | – | Pass |
| REQ-04 | Detect the season (kharif / rabi / zaid) from the date | TC-16 – TC-18 | BUG-004 (open, low) | Pass |
| REQ-05 | Daily irrigation = ET₀ × Kc − 0.8 × rain, never negative, scaled by area | TC-19 – TC-23, TC-45 | – | Pass |
| REQ-06 | Convert N-P-K targets into Urea / DAP / MOP kg | TC-24 – TC-26, TC-45 | – | Pass |
| REQ-07 | Reject a field area that is zero or negative | TC-46 | BUG-002 (fixed) | Pass |
| REQ-08 | Give weather advice: rain, heat, wind, fungal, frost, heat stress | TC-27 – TC-34, TC-43 | – | Pass |
| REQ-09 | Get the GPS position and show live weather and a 7-day forecast | TC-43, MT-03 | – | Pass (MT-03 pending) |
| REQ-10 | Handle GPS denial and weather API failure without crashing | TC-51, TC-52 | – | Pass |
| REQ-11 | Analyse a leaf photo on-device (green / yellow / brown, health score) | TC-35 – TC-39, TC-72, TC-50, MT-02 | – | Pass (MT-02 pending) |
| REQ-12 | Save diary entries with time and GPS, kept after reload | TC-47 | – | Pass |
| REQ-13 | Export the diary to CSV | TC-49 | – | Pass |
| REQ-14 | User input must never be executed as HTML or script | TC-40, TC-41, TC-48, TC-71 | BUG-001 (fixed) | Pass |
| REQ-15 | App loads and works offline; installable | TC-42, TC-53, MT-01, MT-04 | BUG-003 (fixed) | Pass (MT pending) |
| REQ-16 | Voice assistant understands spoken or typed questions in English, Hindi, Tamil and Telugu, and answers aloud in the same language using the on-device calculations | TC-54 – TC-69, MT-05 | – | Pass (MT-05 pending) |
| REQ-17 | If the browser has no speech recognition, the mic is disabled with a message and typed questions still work | TC-70 | – | Pass |
| REQ-18 | The weather API returns every field the app reads, in the expected units and ranges, and rejects invalid requests with HTTP 400 | TC-73 – TC-80 | – | Pass |

**Coverage:** 18 of 18 requirements (100 %) have at least one automated test.

## Backward traceability (test → requirement)

| Test cases | Requirement |
|---|---|
| TC-01 – TC-12 | REQ-01 |
| TC-13, TC-14 | REQ-02 |
| TC-15 | REQ-03 |
| TC-16 – TC-18 | REQ-04 |
| TC-19 – TC-23 | REQ-05 |
| TC-24 – TC-26 | REQ-06 |
| TC-27 – TC-34 | REQ-08 |
| TC-35 – TC-39 | REQ-11 |
| TC-40, TC-41 | REQ-14 |
| TC-42 | REQ-15 |
| TC-43 | REQ-09, REQ-08 |
| TC-44 | REQ-02 |
| TC-45 | REQ-05, REQ-06 |
| TC-46 | REQ-07 |
| TC-47 | REQ-12 |
| TC-48 | REQ-14 |
| TC-49 | REQ-13 |
| TC-50 | REQ-11 |
| TC-51, TC-52 | REQ-10 |
| TC-53 | REQ-15 |
| TC-54 – TC-69 | REQ-16 |
| TC-70 | REQ-17 |
| TC-71 | REQ-14 |
| TC-72 | REQ-11 |
| TC-73 – TC-80 | REQ-18 |
| MT-01, MT-04 | REQ-15 |
| MT-02 | REQ-11 |
| MT-03 | REQ-09 |
| MT-05 | REQ-16 |

No test case is orphaned. Every test traces to at least one requirement.
