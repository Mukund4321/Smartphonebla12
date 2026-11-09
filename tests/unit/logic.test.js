// Unit tests (xUnit style, Node.js built-in test runner – the JavaScript equivalent of JUnit)
// Run: npm test
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../app.js');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const riceInput = t => ({ soil: 'clay', ph: 6.5, season: 'kharif', water: 'high', temp: t });
const rice = t => A.scoreCrop('Rice', A.CROPS.Rice, riceInput(t)).score;

describe('Crop scoring – Boundary Value Analysis on temperature (Rice 20–35 °C)', () => {
  test('TC-01 min-1 (19 °C) loses 5 points', () => assert.equal(rice(19), 95));
  test('TC-02 min (20 °C) full score', () => assert.equal(rice(20), 100));
  test('TC-03 nominal (27 °C) full score', () => assert.equal(rice(27), 100));
  test('TC-04 max (35 °C) full score', () => assert.equal(rice(35), 100));
  test('TC-05 max+1 (36 °C) loses 5 points', () => assert.equal(rice(36), 95));
  test('TC-06 far outside (0 °C) temperature points floor at 0, never negative', () => assert.equal(rice(0), 70));
});

describe('Crop scoring – Equivalence Partitioning on pH and water', () => {
  test('TC-07 pH inside range (6.5) → 20 pH points', () => assert.equal(rice(27), 100));
  test('TC-08 pH below range (5.0) → partial credit 15', () =>
    assert.equal(A.scoreCrop('Rice', A.CROPS.Rice, { ...riceInput(27), ph: 5.0 }).score, 95));
  test('TC-09 pH far above range (9.0) → 0 pH points', () =>
    assert.equal(A.scoreCrop('Rice', A.CROPS.Rice, { ...riceInput(27), ph: 9.0 }).score, 80));
  test('TC-10 water high for high-need crop → 10 points', () => assert.equal(rice(27), 100));
  test('TC-11 water medium for high-need crop → 5 points', () =>
    assert.equal(A.scoreCrop('Rice', A.CROPS.Rice, { ...riceInput(27), water: 'med' }).score, 95));
  test('TC-12 water low for high-need crop → 0 points', () =>
    assert.equal(A.scoreCrop('Rice', A.CROPS.Rice, { ...riceInput(27), water: 'low' }).score, 90));
});

describe('Crop recommender – functional', () => {
  test('TC-13 clay / pH 6.5 / kharif / high water / 27 °C → Rice ranked first', () => {
    const r = A.recommend(riceInput(27));
    assert.equal(r[0].name, 'Rice'); assert.equal(r[0].score, 100);
  });
  test('TC-14 returns exactly 4 results sorted by score (descending)', () => {
    const r = A.recommend({ soil: 'loam', ph: 6.8, season: 'rabi', water: 'med', temp: 18 });
    assert.equal(r.length, 4);
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  });
  test('TC-15 every score stays within 0–100 for extreme inputs', () => {
    for (const temp of [-20, 60]) for (const ph of [4, 9]) {
      for (const [n, c] of Object.entries(A.CROPS)) {
        const s = A.scoreCrop(n, c, { soil: 'sandy', ph, season: 'zaid', water: 'low', temp }).score;
        assert.ok(s >= 0 && s <= 100, `${n} ${s}`);
      }
    }
  });
});

describe('Season detection – BVA on month boundaries', () => {
  const at = m => A.seasonOf(new Date(2026, m - 1, 15));
  test('TC-16 May → zaid, June → kharif', () => { assert.equal(at(5), 'zaid'); assert.equal(at(6), 'kharif'); });
  test('TC-17 October → kharif, November → rabi', () => { assert.equal(at(10), 'kharif'); assert.equal(at(11), 'rabi'); });
  test('TC-18 February → rabi, March → zaid', () => { assert.equal(at(2), 'rabi'); assert.equal(at(3), 'zaid'); });
});

describe('Irrigation model', () => {
  test('TC-19 ET0 5 × Kc 1.1, no rain, 1 acre → 5.5 mm ≈ 22,258 L', () => {
    const r = A.irrigation('Wheat', 1.1, 5, 0, 1);
    near(r.mmPerDay, 5.5); near(r.litresPerDay, 22257.73);
  });
  test('TC-20 BVA rain just below cutoff (6.8 mm) → small positive need', () =>
    assert.ok(A.irrigation('Wheat', 1.1, 5, 6.8, 1).mmPerDay > 0));
  test('TC-21 BVA rain at cutoff (6.875 mm) → need is exactly 0', () =>
    near(A.irrigation('Wheat', 1.1, 5, 6.875, 1).mmPerDay, 0));
  test('TC-22 heavy rain (50 mm) → never negative', () =>
    assert.equal(A.irrigation('Wheat', 1.1, 5, 50, 1).mmPerDay, 0));
  test('TC-23 litres scale linearly with area (2 acres = 2 × 1 acre)', () =>
    near(A.irrigation('Rice', 1.1, 6, 0, 2).litresPerDay, 2 * A.irrigation('Rice', 1.1, 6, 0, 1).litresPerDay));
});

describe('Fertilizer calculator', () => {
  test('TC-24 Wheat 1 acre → DAP 52.2, Urea 83.9, MOP 26.7 kg', () => {
    const f = A.fertilizer('Wheat', 1);
    near(f.dap, 52.17); near(f.urea, 83.93); near(f.mop, 26.67);
  });
  test('TC-25 Chickpea has no K target → MOP 0 kg', () => assert.equal(A.fertilizer('Chickpea', 1).mop, 0));
  test('TC-26 Urea never negative when DAP already covers N (Groundnut)', () =>
    assert.ok(A.fertilizer('Groundnut', 1).urea >= 0));
});

describe('Weather advice – Decision Table', () => {
  const W = o => ({ temp: 25, humidity: 50, wind: 5, rainNext24: 0, ...o });
  const has = (out, cls, word) => out.some(([c, t]) => c === cls && t.includes(word));
  test('TC-27 R1 heavy rain (12 mm) → skip irrigation & spraying', () => assert.ok(has(A.adviceFrom(W({ rainNext24: 12 })), 'bad', 'skip irrigation')));
  test('TC-28 R2 hot (33 °C) & dry → irrigate early morning', () => assert.ok(has(A.adviceFrom(W({ temp: 33 })), 'mid', 'Hot & dry')));
  test('TC-29 R3 windy (20 km/h boundary) → avoid spraying', () => assert.ok(has(A.adviceFrom(W({ wind: 20 })), 'bad', 'avoid pesticide')));
  test('TC-30 R3 calm (19.9 km/h) → spraying OK', () => assert.ok(has(A.adviceFrom(W({ wind: 19.9 })), 'good', 'calm')));
  test('TC-31 R4 humidity 85 % + 25 °C → fungal risk', () => assert.ok(has(A.adviceFrom(W({ humidity: 85 })), 'mid', 'fungal')));
  test('TC-32 R5 5 °C → frost alert; 5.1 °C → none', () => {
    assert.ok(has(A.adviceFrom(W({ temp: 5 })), 'bad', 'Frost'));
    assert.ok(!has(A.adviceFrom(W({ temp: 5.1 })), 'bad', 'Frost'));
  });
  test('TC-33 R6 38 °C → heat stress alert', () => assert.ok(has(A.adviceFrom(W({ temp: 38 })), 'bad', 'Heat stress')));
  test('TC-34 rain 9.9 mm (below 10 boundary) → no skip-irrigation alert', () => assert.ok(!has(A.adviceFrom(W({ rainNext24: 9.9 })), 'bad', 'skip irrigation')));
});

describe('Leaf health analysis', () => {
  const img = (...px) => { const a = []; for (const [rgb, n] of px) for (let i = 0; i < n; i++) a.push(...rgb, 255); return Uint8ClampedArray.from(a); };
  test('TC-35 all-green leaf → health 100, "healthy"', () => {
    const r = A.analyseLeaf(img([[40, 160, 40], 100])); assert.equal(r.health, 100); assert.match(r.note, /healthy/);
  });
  test('TC-36 all-yellow leaf → yellowing / nitrogen advice', () => {
    const r = A.analyseLeaf(img([[200, 180, 60], 100])); assert.equal(r.yellow, 100); assert.match(r.note, /nitrogen/);
  });
  test('TC-37 brown spots → fungal / spot advice, health clamped at 0', () => {
    const r = A.analyseLeaf(img([[140, 90, 40], 100])); assert.equal(r.health, 0); assert.match(r.note, /fungal/);
  });
  test('TC-38 white background only → null (no plant tissue)', () => assert.equal(A.analyseLeaf(img([[255, 255, 255], 100])), null));
  test('TC-39 50 % green + 50 % yellow → health 50', () => assert.equal(A.analyseLeaf(img([[40, 160, 40], 50], [[200, 180, 60], 50])).health, 50));
  // Found by the coverage report: the "Mixed colours" branch (app.js line 89) was never executed
  test('TC-72 60 % green + 40 % unclassified (blue) → "Mixed colours, retake photo"', () => {
    const r = A.analyseLeaf(img([[40, 160, 40], 60], [[40, 40, 160], 40]));
    assert.equal(r.green, 60); assert.match(r.note, /Mixed colours/);
  });
});

describe('Security – output encoding (BUG-001 regression)', () => {
  test('TC-40 script/img payload is neutralised', () =>
    assert.equal(A.escapeHTML('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;'));
  test('TC-41 quotes and ampersand escaped; null/undefined → empty string', () => {
    assert.equal(A.escapeHTML(`"a" & 'b'`), '&quot;a&quot; &amp; &#39;b&#39;');
    assert.equal(A.escapeHTML(null), ''); assert.equal(A.escapeHTML(undefined), '');
  });
});

describe('Voice assistant – intent classification (EP: one partition per language)', () => {
  const C = A.classifyVoiceIntent;
  test('TC-54 English: weather / crops / water / fertilizer / leaf', () => {
    assert.equal(C('What is the weather?').intent, 'weather');
    assert.equal(C('Recommend crops').intent, 'crop');
    assert.deepEqual(C('How much water for rice?'), { intent: 'water', crop: 'Rice' });
    assert.deepEqual(C('Fertilizer for wheat'), { intent: 'fertilizer', crop: 'Wheat' });
    assert.equal(C('my leaf has spots').intent, 'leaf');
  });
  test('TC-55 Hindi (हिन्दी)', () => {
    assert.equal(C('आज मौसम कैसा है?').intent, 'weather');
    assert.equal(C('कौन सी फसल लगाऊं?').intent, 'crop');
    assert.deepEqual(C('धान को कितना पानी चाहिए?'), { intent: 'water', crop: 'Rice' });
    assert.deepEqual(C('गेहूं के लिए खाद बताओ'), { intent: 'fertilizer', crop: 'Wheat' });
  });
  test('TC-56 Tamil (தமிழ்)', () => {
    assert.equal(C('இன்று வானிலை எப்படி?').intent, 'weather');
    assert.equal(C('எந்த பயிர் பயிரிடலாம்?').intent, 'crop');
    assert.deepEqual(C('நெல்லுக்கு எவ்வளவு தண்ணீர்?'), { intent: 'water', crop: 'Rice' });
    assert.deepEqual(C('கோதுமைக்கு உரம் எவ்வளவு?'), { intent: 'fertilizer', crop: 'Wheat' });
  });
  test('TC-57 Telugu (తెలుగు)', () => {
    assert.equal(C('ఈరోజు వాతావరణం ఎలా ఉంది?').intent, 'weather');
    assert.equal(C('ఏ పంట వేయాలి?').intent, 'crop');
    assert.deepEqual(C('వరికి ఎంత నీరు కావాలి?'), { intent: 'water', crop: 'Rice' });
    assert.deepEqual(C('గోధుమకు ఎరువు ఎంత?'), { intent: 'fertilizer', crop: 'Wheat' });
  });
  test('TC-58 overlapping crop names: వేరుశనగ → Groundnut, not Chickpea (శనగ)', () => {
    assert.equal(C('వేరుశనగకు ఎరువు').crop, 'Groundnut');
    assert.equal(C('శనగకు ఎరువు').crop, 'Chickpea');
  });
  test('TC-59 invalid partition: empty, null, gibberish → unknown', () => {
    for (const t of ['', null, undefined, 'hello there', '12345']) assert.equal(C(t).intent, 'unknown');
  });
  test('TC-60 case-insensitive ("WEATHER" = "weather")', () => assert.equal(C('WEATHER TODAY').intent, 'weather'));
});

describe('Voice assistant – spoken replies use the same calculation engine', () => {
  const P = A.processVoiceCommand;
  const wx = { temp: 33.4, humidity: 40, wind: 25, rainNext24: 0, et0: 5, daily: [{ max: 34, min: 20 }] };
  test('TC-61 weather without GPS → asks the user to set location (Hindi)', () =>
    assert.match(P('मौसम', 'hi-IN', {}).reply, /GPS/));
  test('TC-62 weather with data → numbers + wind warning (English)', () => {
    const r = P('weather', 'en-IN', { wx }).reply;
    assert.match(r, /Temperature 33 degrees/); assert.match(r, /do not spray/);
  });
  test('TC-63 fertilizer reply matches fertilizer() – Wheat 1 acre: urea 84, DAP 52, MOP 27 (Telugu)', () => {
    const r = P('గోధుమకు ఎరువు', 'te-IN', {}).reply;
    assert.match(r, /గోధుమ/); assert.match(r, /84/); assert.match(r, /52/); assert.match(r, /27/);
  });
  test('TC-64 water reply matches irrigation() – Rice, ET0 5, Kc 1.1 → 5.5 mm, 22258 L (Tamil)', () => {
    const r = P('நெல்லுக்கு தண்ணீர்', 'ta-IN', { wx }).reply;
    assert.match(r, /நெல்/); assert.match(r, /5\.5/); assert.match(r, /22258/);
  });
  test('TC-65 crop reply lists the top 3 from recommend(), in the local language (Hindi, rabi)', () => {
    const top = A.recommend({ soil: 'loam', ph: 6.5, season: 'rabi', water: 'med', temp: 27 }).slice(0, 3).map(r => A.CROP_NAMES[r.name].hi);
    const r = P('फसल', 'hi-IN', { season: 'rabi' }).reply;
    for (const n of top) assert.ok(r.includes(n), n);
    assert.match(r, /रबी/);
  });
  test('TC-66 unsupported language code falls back to English', () =>
    assert.match(P('xyz', 'fr-FR', {}).reply, /Sorry, I did not understand/));
});
