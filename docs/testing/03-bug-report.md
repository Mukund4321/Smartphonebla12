# Bug Report – Smart Agri Assistant

| Summary | Count |
|---|---|
| Defects logged | 4 |
| Fixed and verified | 3 |
| Open (low, deferred) | 1 |
| Open Critical / High | **0** |

---

## BUG-001 – Stored XSS: diary note is rendered as HTML
| Field | Value |
|---|---|
| Severity / Priority | **High / P1** |
| Module | Farm Diary (`app.js`, `renderLog`) |
| Found by | Code review (taint analysis), confirmed in the browser |
| Status | **Fixed – verified** |

**Steps to reproduce**
1. Open the Diary tab.
2. Enter the note `<img src=x onerror="alert(1)">` and tap **Save entry**.

**Expected:** the note is displayed as plain text.
**Actual (before fix):** the browser created an `<img>` element and ran `alert(1)`. The payload is stored in `localStorage`, so it runs again on every page load.

**Root cause:** `renderLog()` built HTML with `${x.note}` and assigned it to `innerHTML` without escaping.

**Fix:** added `escapeHTML()`, which encodes `& < > " '`, and applied it to `x.type` and `x.note`.

**Verification:** TC-40 and TC-41 (unit), TC-48 (Playwright: text shown literally, 0 `<img>` elements, no dialog). All pass.

---

## BUG-002 – Calculator accepts zero / negative field area
| Field | Value |
|---|---|
| Severity / Priority | **Medium / P2** |
| Module | Fertilizer & Irrigation Calculator (`btnCalc` handler) |
| Found by | Boundary value analysis on the *area* input |
| Status | **Fixed – verified** |

**Steps to reproduce**
1. Open the Calc tab, choose Wheat.
2. Enter area `-2` and tap **Calculate**. Repeat with `0`.

**Expected:** a validation message; no quantities are shown.
**Actual (before fix):**
- `-2` showed **DAP −104 kg, MOP −53 kg, −44,515 L of water**.
- `0` was silently replaced with 1 acre, because of `+value || 1`.

**Root cause:** `area = +$('area').value || 1` treats 0 as "missing" and does not reject negatives. The HTML `min="0.1"` attribute does not stop typed values.

**Fix:** `if (!(area > 0))`, show "Enter a field area greater than 0 acres." and stop.

**Verification:** TC-46 (Playwright, values 0 and −2). Pass.

---

## BUG-003 – Updated app never reaches installed users (stale service-worker cache)
| Field | Value |
|---|---|
| Severity / Priority | **Medium / P2** |
| Module | Offline layer (`sw.js`) |
| Found by | Code review |
| Status | **Fixed – verified by inspection** |

**Description:** `sw.js` serves files cache-first under the fixed name `agri-v1`. If the files change but the name stays the same, phones that have already visited keep serving the old `app.js`, so bug fixes never arrive.

**Fix:** cache name bumped to `agri-v2` (now `agri-v3` after the voice release). The `activate` handler then deletes the old cache. Process rule added: bump the version on every release.

**Verification:** TC-53 confirms that the new cache serves the app offline. The update path from v1 to v2 was checked by reviewing the `activate` handler.

---

## BUG-004 – Season labels overlap in March
| Field | Value |
|---|---|
| Severity / Priority | Low / P4 |
| Module | Crop recommender – season dropdown |
| Found by | Boundary value analysis (TC-18) |
| Status | **Open – deferred** |

**Description:** the dropdown says "Rabi (Nov–Mar)" and "Zaid (Mar–Jun)", so March belongs to both. `seasonOf()` always returns **zaid** for March. The code is consistent, but the labels can confuse a farmer who sows rabi crops in early March.

**Suggested fix:** relabel as "Rabi (Nov–Feb)", or split March by date (before or after the 15th).
