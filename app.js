'use strict';
/* Smart Agri Assistant – smartphone computation demo
   Uses: Geolocation, fetch (Open-Meteo, no API key), Camera + Canvas image
   processing, localStorage, Service Worker (offline), online/offline events. */

/* ---------- Crop knowledge base ---------- */
// t=[min,max] best avg temp °C, ph=[min,max], water: 1 low..3 high,
// soils, seasons, npk = kg/acre (N,P2O5,K2O), et = peak water mm/day, days to harvest
const CROPS = {
  Rice:      {t:[20,35],ph:[5.5,7],water:3,soils:['clay','alluvial','black'],seasons:['kharif'],npk:[48,24,24],et:7,days:120},
  Wheat:     {t:[10,25],ph:[6,7.5],water:2,soils:['loam','alluvial','clay'],seasons:['rabi'],npk:[48,24,16],et:5,days:130},
  Maize:     {t:[18,32],ph:[5.8,7.5],water:2,soils:['loam','alluvial','red'],seasons:['kharif','zaid'],npk:[48,24,20],et:6,days:100},
  Cotton:    {t:[21,35],ph:[6,8],water:2,soils:['black','alluvial'],seasons:['kharif'],npk:[48,24,24],et:7,days:170},
  Sugarcane: {t:[21,35],ph:[6,8],water:3,soils:['loam','alluvial','black'],seasons:['kharif','zaid'],npk:[100,40,40],et:8,days:330},
  Groundnut: {t:[22,33],ph:[5.8,7],water:1,soils:['sandy','red','loam'],seasons:['kharif'],npk:[10,20,20],et:5,days:110},
  Chickpea:  {t:[10,28],ph:[6,8],water:1,soils:['black','loam','sandy'],seasons:['rabi'],npk:[8,20,0],et:4,days:105},
  Mustard:   {t:[10,25],ph:[6,7.5],water:1,soils:['loam','sandy','alluvial'],seasons:['rabi'],npk:[40,16,8],et:4,days:120},
  Soybean:   {t:[20,32],ph:[6,7.5],water:2,soils:['black','loam','red'],seasons:['kharif'],npk:[12,32,16],et:6,days:100},
  Tomato:    {t:[18,30],ph:[6,7],water:2,soils:['loam','sandy','red'],seasons:['rabi','zaid','kharif'],npk:[48,24,24],et:6,days:110},
  Millet:    {t:[24,36],ph:[5.5,8],water:1,soils:['sandy','red','black'],seasons:['kharif','zaid'],npk:[16,8,0],et:4,days:90},
  Watermelon:{t:[24,35],ph:[6,7],water:2,soils:['sandy','loam'],seasons:['zaid'],npk:[32,16,16],et:6,days:90}
};

/* ---------- Pure logic (also unit-tested in Node) ---------- */
function seasonOf(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 6 && m <= 10) return 'kharif';
  if (m === 11 || m === 12 || m <= 2) return 'rabi';
  return 'zaid';
}

function scoreCrop(name, c, inp) {
  let s = 0; const why = [];
  const [t0, t1] = c.t;
  if (inp.temp >= t0 && inp.temp <= t1) { s += 30; why.push('temperature suits'); }
  else { const d = Math.min(Math.abs(inp.temp - t0), Math.abs(inp.temp - t1)); s += Math.max(0, 30 - d * 5); why.push('temp off by ' + d.toFixed(0) + '°C'); }
  if (inp.ph >= c.ph[0] && inp.ph <= c.ph[1]) { s += 20; why.push('pH ok'); }
  else { const d = Math.min(Math.abs(inp.ph - c.ph[0]), Math.abs(inp.ph - c.ph[1])); s += Math.max(0, 20 - d * 10); why.push('pH off'); }
  if (c.soils.includes(inp.soil)) { s += 20; why.push('soil suits'); }
  if (c.seasons.includes(inp.season)) { s += 20; why.push('right season'); }
  const w = { low: 1, med: 2, high: 3 }[inp.water];
  if (c.water <= w) { s += 10; why.push('water enough'); }
  else { s += Math.max(0, 10 - (c.water - w) * 5); why.push('needs more water'); }
  return { name, score: Math.round(s), why, crop: c };
}

function recommend(inp) {
  return Object.entries(CROPS).map(([n, c]) => scoreCrop(n, c, inp)).sort((a, b) => b.score - a.score).slice(0, 4);
}

// Simple ET-based irrigation: crop water need = ET0 * Kc ; minus effective rain
function irrigation(crop, kc, et0, rain24mm, areaAcre) {
  const need = Math.max(0, et0 * kc - rain24mm * 0.8); // mm/day
  const litres = need * 4046.86 * areaAcre;           // 1 mm over 1 m² = 1 L
  return { mmPerDay: need, litresPerDay: litres };
}

function fertilizer(crop, areaAcre) {
  const [n, p, k] = CROPS[crop].npk;
  // Convert nutrient need to products: Urea 46% N, DAP 18% N + 46% P2O5, MOP 60% K2O
  const dap = (p / 0.46) * areaAcre;
  const nFromDap = dap * 0.18;
  const urea = Math.max(0, (n * areaAcre - nFromDap) / 0.46);
  const mop = (k / 0.60) * areaAcre;
  return { urea, dap, mop };
}

// Leaf colour analysis: Excess Green / yellow / brown pixel fractions
function analyseLeaf(rgba) {
  let green = 0, yellow = 0, brown = 0, total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 40 || (max > 225 && min > 200)) continue;            // too dark / background sky-white
    if (max - min < 25) continue;                                   // grey, not plant tissue
    total++;
    if (g > r * 1.05 && g > b * 1.1) green++;                       // healthy green
    else if (r > 150 && g > 130 && b < 110 && Math.abs(r - g) < 60) yellow++; // chlorosis
    else if (r > g && r > b && g > b && r < 190) brown++;           // necrosis / spots
  }
  if (!total) return null;
  const pct = x => Math.round(100 * x / total);
  const res = { green: pct(green), yellow: pct(yellow), brown: pct(brown), samples: total };
  const stress = res.yellow + res.brown * 1.5;
  res.health = Math.max(0, Math.min(100, Math.round(100 - stress)));
  if (res.yellow > 20 && res.yellow >= res.brown) res.note = 'Yellowing suggests nitrogen/iron deficiency or overwatering. Check drainage; consider urea top‑dressing.';
  else if (res.brown > 12) res.note = 'Brown patches suggest fungal/bacterial spot or sun‑scorch. Inspect for lesions; remove affected leaves; consult local agri officer before spraying.';
  else if (res.green > 70) res.note = 'Leaf looks healthy.';
  else res.note = 'Mixed colours – retake the photo in daylight, leaf filling the frame.';
  return res;
}

// Escape user text before inserting into HTML (fix for BUG-001, stored XSS in diary)
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function adviceFrom(w) {
  const out = [];
  if (w.rainNext24 >= 10) out.push(['bad', `🌧 ${w.rainNext24.toFixed(0)} mm rain expected in 24h – skip irrigation and spraying.`]);
  else if (w.rainNext24 < 1 && w.temp >= 32) out.push(['mid', '🚿 Hot & dry – irrigate early morning or evening.']);
  if (w.wind >= 20) out.push(['bad', `💨 Wind ${w.wind.toFixed(0)} km/h – avoid pesticide spraying (drift).`]);
  else out.push(['good', '✅ Wind is calm enough for spraying.']);
  if (w.humidity >= 85 && w.temp >= 20 && w.temp <= 30) out.push(['mid', '🍄 High humidity + warm – fungal disease risk. Scout fields.']);
  if (w.temp <= 5) out.push(['bad', '🥶 Frost risk – cover seedlings / light irrigation at night.']);
  if (w.temp >= 38) out.push(['bad', '🔥 Heat stress – mulch and avoid midday field work.']);
  return out;
}

/* ---------- Voice assistant (multilingual: en / hi / ta / te) ---------- */
// Local crop names, also used to spot a crop mentioned in a spoken question
const CROP_NAMES = {
  Rice:      { hi: 'चावल', ta: 'நெல்', te: 'వరి', alias: ['rice', 'paddy', 'धान', 'चावल', 'அரிசி', 'நெல்', 'బియ్యం', 'వరి'] },
  Wheat:     { hi: 'गेहूं', ta: 'கோதுமை', te: 'గోధుమ', alias: ['wheat', 'गेहूं', 'गेहूँ', 'கோதுமை', 'గోధుమ'] },
  Maize:     { hi: 'मक्का', ta: 'மக்காச்சோளம்', te: 'మొక్కజొన్న', alias: ['maize', 'corn', 'मक्का', 'மக்காச்சோளம்', 'சோளம்', 'మొక్కజొన్న'] },
  Cotton:    { hi: 'कपास', ta: 'பருத்தி', te: 'పత్తి', alias: ['cotton', 'कपास', 'பருத்தி', 'పత్తి'] },
  Sugarcane: { hi: 'गन्ना', ta: 'கரும்பு', te: 'చెరకు', alias: ['sugarcane', 'गन्ना', 'गन्ने', 'கரும்பு', 'చెరకు'] },
  Groundnut: { hi: 'मूंगफली', ta: 'நிலக்கடலை', te: 'వేరుశనగ', alias: ['groundnut', 'peanut', 'मूंगफली', 'நிலக்கடலை', 'வேர்க்கடலை', 'వేరుశనగ'] },
  Chickpea:  { hi: 'चना', ta: 'கொண்டைக்கடலை', te: 'శనగ', alias: ['chickpea', 'चना', 'चने', 'கொண்டைக்கடலை', 'శనగ'] },
  Mustard:   { hi: 'सरसों', ta: 'கடுகு', te: 'ఆవాలు', alias: ['mustard', 'सरसों', 'கடுகு', 'ఆవాలు'] },
  Soybean:   { hi: 'सोयाबीन', ta: 'சோயாபீன்', te: 'సోయాబీన్', alias: ['soybean', 'soya', 'सोयाबीन', 'சோயா', 'సోయా'] },
  Tomato:    { hi: 'टमाटर', ta: 'தக்காளி', te: 'టమాటా', alias: ['tomato', 'टमाटर', 'தக்காளி', 'టమాటా', 'టమోటా'] },
  Millet:    { hi: 'बाजरा', ta: 'கம்பு', te: 'సజ్జలు', alias: ['millet', 'bajra', 'बाजरा', 'கம்பு', 'సజ్జ'] },
  Watermelon:{ hi: 'तरबूज', ta: 'தர்பூசணி', te: 'పుచ్చకాయ', alias: ['watermelon', 'तरबूज', 'தர்பூசணி', 'పుచ్చకాయ'] }
};

// Intent keywords in all 4 languages. Checked in this order: the first match wins
const VOICE_INTENTS = [
  ['fertilizer', ['fertili', 'urea', 'manure', 'nutrient', 'खाद', 'उर्वरक', 'यूरिया', 'உரம்', 'உரங்', 'யூரியா', 'ఎరువు', 'యూరియా']],
  ['water',      ['water', 'irrigat', 'पानी', 'सिंचाई', 'தண்ணீர்', 'நீர்', 'பாசன', 'నీరు', 'నీళ్లు', 'నీళ్ళు', 'నీటి']],
  ['leaf',       ['leaf', 'leaves', 'disease', 'pest', 'पत्ती', 'पत्ते', 'रोग', 'बीमारी', 'இலை', 'நோய்', 'ఆకు', 'తెగులు', 'వ్యాధి']],
  ['weather',    ['weather', 'rain', 'temperature', 'forecast', 'wind', 'मौसम', 'बारिश', 'तापमान', 'வானிலை', 'மழை', 'வெப்பநிலை', 'వాతావరణం', 'వర్షం', 'ఉష్ణోగ్రత']],
  ['crop',       ['crop', 'recommend', 'grow', 'sow', 'plant', 'फसल', 'सुझा', 'उगा', 'लगाऊ', 'பயிர்', 'பயிரிட', 'பயிர', 'పంట', 'సాగు']]
];

// Returns { intent: 'weather'|'crop'|'water'|'fertilizer'|'leaf'|'unknown', crop: 'Rice'|...|null }
function classifyVoiceIntent(text) {
  const t = String(text || '').toLowerCase().trim();
  let intent = 'unknown';
  for (const [name, words] of VOICE_INTENTS) if (words.some(w => t.includes(w))) { intent = name; break; }
  // Longest alias first, so "వేరుశనగ" (groundnut) is not mistaken for "శనగ" (chickpea)
  const aliases = Object.entries(CROP_NAMES).flatMap(([crop, v]) => v.alias.map(a => [a, crop])).sort((a, b) => b[0].length - a[0].length);
  const hit = aliases.find(([a]) => t.includes(a));
  return { intent, crop: hit ? hit[1] : null };
}

const VOICE_TEXT = {
  en: {
    weather: (t, h, w, r, tip) => `Temperature ${t} degrees, humidity ${h} percent, wind ${w} kilometres per hour, rain expected ${r} millimetres. ${tip}`,
    rain: 'Heavy rain expected, skip irrigation and spraying.', wind: 'Strong wind, do not spray pesticide.', ok: 'Conditions are fine for field work.',
    noLoc: 'Please tap Use my GPS location on the Home tab first.',
    crop: (s, list) => `For ${s} season, the best crops are ${list}.`,
    water: (c, mm, l) => `${c} needs about ${mm} millimetres of water per day, that is ${l} litres per acre.`,
    fert: (c, u, d, m) => `For one acre of ${c}: urea ${u} kilograms, DAP ${d} kilograms, MOP ${m} kilograms.`,
    leaf: 'Open the Leaf tab and take a photo of the leaf in daylight. I will check its health.',
    unknown: 'Sorry, I did not understand. Ask about weather, crops, water or fertilizer.',
    season: { kharif: 'Kharif', rabi: 'Rabi', zaid: 'Zaid' }
  },
  hi: {
    weather: (t, h, w, r, tip) => `तापमान ${t} डिग्री, नमी ${h} प्रतिशत, हवा ${w} किलोमीटर प्रति घंटा, बारिश ${r} मिलीमीटर। ${tip}`,
    rain: 'भारी बारिश की संभावना है, सिंचाई और छिड़काव न करें।', wind: 'तेज़ हवा है, कीटनाशक का छिड़काव न करें।', ok: 'खेत के काम के लिए मौसम ठीक है।',
    noLoc: 'कृपया पहले होम टैब पर GPS लोकेशन बटन दबाएँ।',
    crop: (s, list) => `${s} मौसम के लिए सबसे अच्छी फसलें हैं: ${list}।`,
    water: (c, mm, l) => `${c} को रोज़ लगभग ${mm} मिलीमीटर पानी चाहिए, यानी प्रति एकड़ ${l} लीटर।`,
    fert: (c, u, d, m) => `एक एकड़ ${c} के लिए: यूरिया ${u} किलो, डीएपी ${d} किलो, एमओपी ${m} किलो।`,
    leaf: 'पत्ती टैब खोलें और दिन की रोशनी में पत्ती की फोटो लें। मैं उसकी सेहत जाँचूँगा।',
    unknown: 'माफ़ कीजिए, मैं समझ नहीं पाया। मौसम, फसल, पानी या खाद के बारे में पूछें।',
    season: { kharif: 'खरीफ', rabi: 'रबी', zaid: 'जायद' }
  },
  ta: {
    weather: (t, h, w, r, tip) => `வெப்பநிலை ${t} டிகிரி, ஈரப்பதம் ${h} சதவீதம், காற்று மணிக்கு ${w} கிலோமீட்டர், மழை ${r} மில்லிமீட்டர். ${tip}`,
    rain: 'கனமழை எதிர்பார்க்கப்படுகிறது, நீர்ப்பாசனம் மற்றும் தெளிப்பைத் தவிர்க்கவும்.', wind: 'பலத்த காற்று, பூச்சிக்கொல்லி தெளிக்க வேண்டாம்.', ok: 'வயல் வேலைக்கு வானிலை சரியாக உள்ளது.',
    noLoc: 'முதலில் முகப்புத் தாவலில் GPS இருப்பிட பொத்தானை அழுத்தவும்.',
    crop: (s, list) => `${s} பருவத்திற்கு சிறந்த பயிர்கள்: ${list}.`,
    water: (c, mm, l) => `${c} பயிருக்கு நாளொன்றுக்கு சுமார் ${mm} மில்லிமீட்டர் நீர் தேவை, அதாவது ஏக்கருக்கு ${l} லிட்டர்.`,
    fert: (c, u, d, m) => `ஒரு ஏக்கர் ${c} பயிருக்கு: யூரியா ${u} கிலோ, டிஏபி ${d} கிலோ, எம்ஓபி ${m} கிலோ.`,
    leaf: 'இலை தாவலைத் திறந்து பகல் வெளிச்சத்தில் இலையைப் படம் எடுக்கவும். அதன் ஆரோக்கியத்தைச் சரிபார்க்கிறேன்.',
    unknown: 'மன்னிக்கவும், புரியவில்லை. வானிலை, பயிர், நீர் அல்லது உரம் பற்றி கேளுங்கள்.',
    season: { kharif: 'காரீஃப்', rabi: 'ரபி', zaid: 'சைத்' }
  },
  te: {
    weather: (t, h, w, r, tip) => `ఉష్ణోగ్రత ${t} డిగ్రీలు, తేమ ${h} శాతం, గాలి గంటకు ${w} కిలోమీటర్లు, వర్షం ${r} మిల్లీమీటర్లు. ${tip}`,
    rain: 'భారీ వర్షం అవకాశం ఉంది, నీటి పారుదల మరియు పిచికారీ చేయవద్దు.', wind: 'గాలి బలంగా ఉంది, పురుగుమందు పిచికారీ చేయవద్దు.', ok: 'పొలం పనులకు వాతావరణం అనుకూలంగా ఉంది.',
    noLoc: 'ముందుగా హోమ్ ట్యాబ్‌లో GPS లొకేషన్ బటన్ నొక్కండి.',
    crop: (s, list) => `${s} సీజన్‌కు ఉత్తమ పంటలు: ${list}.`,
    water: (c, mm, l) => `${c} పంటకు రోజుకు సుమారు ${mm} మిల్లీమీటర్ల నీరు అవసరం, అంటే ఎకరానికి ${l} లీటర్లు.`,
    fert: (c, u, d, m) => `ఒక ఎకరం ${c} పంటకు: యూరియా ${u} కిలోలు, డీఏపీ ${d} కిలోలు, ఎంఓపీ ${m} కిలోలు.`,
    leaf: 'ఆకు ట్యాబ్ తెరిచి పగటి వెలుగులో ఆకు ఫోటో తీయండి. దాని ఆరోగ్యాన్ని పరీక్షిస్తాను.',
    unknown: 'క్షమించండి, అర్థం కాలేదు. వాతావరణం, పంట, నీరు లేదా ఎరువు గురించి అడగండి.',
    season: { kharif: 'ఖరీఫ్', rabi: 'రబీ', zaid: 'జైద్' }
  }
};

// Answer a spoken/typed question using the same on-device models as the other tabs.
// lang: 'en-IN' | 'hi-IN' | 'ta-IN' | 'te-IN'; ctx: { wx, season }
function processVoiceCommand(text, lang = 'en-IN', ctx = {}) {
  const L = String(lang).slice(0, 2), T = VOICE_TEXT[L] || VOICE_TEXT.en;
  const name = c => (VOICE_TEXT[L] && L !== 'en' ? CROP_NAMES[c][L] : c);
  const { intent, crop } = classifyVoiceIntent(text);
  const wx = ctx.wx, season = ctx.season || seasonOf();
  let reply;
  if (intent === 'weather') {
    if (!wx) reply = T.noLoc;
    else {
      const tip = wx.rainNext24 >= 10 ? T.rain : wx.wind >= 20 ? T.wind : T.ok;
      reply = T.weather(Math.round(wx.temp), Math.round(wx.humidity), Math.round(wx.wind), +wx.rainNext24.toFixed(1), tip);
    }
  } else if (intent === 'crop') {
    const temp = wx ? (wx.daily[0].max + wx.daily[0].min) / 2 : 27;
    const top = recommend({ soil: 'loam', ph: 6.5, season, water: 'med', temp }).slice(0, 3).map(r => name(r.name));
    reply = T.crop(T.season[season], top.join(', '));
  } else if (intent === 'water') {
    const c = crop || 'Rice';
    const ir = irrigation(c, 1.1, wx ? wx.et0 : CROPS[c].et, wx ? wx.rainNext24 : 0, 1);
    reply = T.water(name(c), +ir.mmPerDay.toFixed(1), Math.round(ir.litresPerDay));
  } else if (intent === 'fertilizer') {
    const c = crop || 'Wheat', f = fertilizer(c, 1);
    reply = T.fert(name(c), Math.round(f.urea), Math.round(f.dap), Math.round(f.mop));
  } else if (intent === 'leaf') reply = T.leaf;
  else reply = T.unknown;
  return { intent, crop, reply };
}

/* ---------- Browser-only code ---------- */
if (typeof document !== 'undefined') {
  const $ = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  let state = { loc: store.get('loc', null), wx: store.get('wx', null) };

  // Tabs
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  });

  // Online status
  const net = () => { $('net').textContent = navigator.onLine ? 'online' : 'offline'; $('net').classList.toggle('off', !navigator.onLine); };
  addEventListener('online', net); addEventListener('offline', net); net();

  // Service worker
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  // Calculator crop list
  $('calcCrop').innerHTML = Object.keys(CROPS).map(c => `<option>${c}</option>`).join('');
  $('ph').oninput = () => $('phv').textContent = $('ph').value;

  // GPS + weather
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }
  async function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&forecast_days=7&timezone=auto`;
    const r = await fetch(url); if (!r.ok) throw new Error('weather ' + r.status);
    const j = await r.json();
    return {
      temp: j.current.temperature_2m, humidity: j.current.relative_humidity_2m, wind: j.current.wind_speed_10m,
      rainNext24: j.daily.precipitation_sum[0] || 0, et0: j.daily.et0_fao_evapotranspiration[0] || 4,
      daily: j.daily.time.map((d, i) => ({ d, max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_sum[i] })),
      at: Date.now()
    };
  }
  function renderWeather() {
    const w = state.wx; if (!w) return;
    $('weather').innerHTML = [['🌡 Temp', w.temp + '°C'], ['💧 Humidity', w.humidity + '%'], ['💨 Wind', w.wind + ' km/h'], ['🌧 Rain today', w.rainNext24.toFixed(1) + ' mm']]
      .map(([k, v]) => `<div class="stat">${k}<b>${v}</b></div>`).join('');
    $('advice').innerHTML = adviceFrom(w).map(([c, t]) => `<li class="${c}">${t}</li>`).join('');
    $('forecast').innerHTML = w.daily.map(x => `<div class="day">${new Date(x.d).toLocaleDateString(undefined, { weekday: 'short' })}<br><b>${Math.round(x.max)}°</b>/${Math.round(x.min)}°<br>🌧${x.rain.toFixed(0)}</div>`).join('');
    if (!navigator.onLine || Date.now() - w.at > 3600e3) $('advice').insertAdjacentHTML('beforeend', '<li class="muted small">Showing cached data from ' + new Date(w.at).toLocaleString() + '</li>');
  }
  async function locate() {
    $('locText').textContent = 'Getting GPS fix…';
    try {
      const p = await getPosition();
      state.loc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      store.set('loc', state.loc);
    } catch (e) { $('locText').textContent = 'GPS failed: ' + e.message + (state.loc ? ' (using last saved location)' : ''); if (!state.loc) return; }
    $('locText').textContent = `📍 ${state.loc.lat.toFixed(4)}, ${state.loc.lon.toFixed(4)} (±${Math.round(state.loc.acc || 0)} m)`;
    try { state.wx = await fetchWeather(state.loc.lat, state.loc.lon); store.set('wx', state.wx); }
    catch (e) { $('locText').textContent += ' – weather unavailable, showing cache'; }
    renderWeather();
  }
  $('btnLocate').onclick = locate;
  if (state.loc) { $('locText').textContent = `📍 ${state.loc.lat.toFixed(4)}, ${state.loc.lon.toFixed(4)} (saved)`; renderWeather(); }

  // Crop recommender
  $('btnRecommend').onclick = () => {
    const season = $('season').value === 'auto' ? seasonOf() : $('season').value;
    const temp = $('tempIn').value !== '' ? +$('tempIn').value : (state.wx ? (state.wx.daily[0].max + state.wx.daily[0].min) / 2 : 27);
    const res = recommend({ soil: $('soil').value, ph: +$('ph').value, season, water: $('water').value, temp });
    $('cropResults').innerHTML = `<p class="muted small">Using season <b>${season}</b>, avg temp <b>${temp.toFixed(0)}°C</b>.</p>` + res.map((r, i) =>
      `<div class="res"><b>${i + 1}. ${r.name}</b> — ${r.score}/100<div class="bar"><i style="width:${r.score}%"></i></div>
       ${r.why.map(w => `<span class="tag">${w}</span>`).join('')}<div class="small muted">~${r.crop.days} days to harvest</div></div>`).join('');
  };

  // Leaf scan (camera → canvas → pixel analysis)
  $('leafFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const cv = $('leafCanvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
      const s = Math.min(320 / img.width, 240 / img.height);
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      ctx.drawImage(img, 0, 0, cv.width, cv.height); cv.hidden = false;
      const r = analyseLeaf(ctx.getImageData(0, 0, cv.width, cv.height).data);
      URL.revokeObjectURL(img.src);
      $('leafResult').innerHTML = !r ? '<p class="bad">No plant tissue detected. Retake closer, in daylight.</p>' :
        `<div class="res"><b>Health score: <span class="${r.health > 75 ? 'good' : r.health > 50 ? 'mid' : 'bad'}">${r.health}/100</span></b>
         <div class="bar"><i style="width:${r.health}%"></i></div>
         <span class="tag">Green ${r.green}%</span><span class="tag">Yellow ${r.yellow}%</span><span class="tag">Brown ${r.brown}%</span>
         <p>${r.note}</p></div>`;
    };
    img.src = URL.createObjectURL(f);
  };

  // Calculator
  $('btnCalc').onclick = () => {
    const crop = $('calcCrop').value, area = +$('area').value, kc = +$('stage').value;
    if (!(area > 0)) { $('calcResult').innerHTML = '<p class="bad">Enter a field area greater than 0 acres.</p>'; return; } // BUG-002 fix
    const w = state.wx || { et0: CROPS[crop].et, rainNext24: 0 };
    const ir = irrigation(crop, kc, w.et0, w.rainNext24, area), f = fertilizer(crop, area);
    $('calcResult').innerHTML = `<div class="res"><b>💧 Irrigation (today)</b><br>${ir.mmPerDay.toFixed(1)} mm/day ≈ <b>${Math.round(ir.litresPerDay).toLocaleString()} L</b> for ${area} acre${state.wx ? '' : ' <span class="muted small">(get GPS for live ET₀/rain)</span>'}</div>
      <div class="res"><b>🧪 Fertilizer for ${crop} (full season)</b><br>Urea: <b>${f.urea.toFixed(0)} kg</b><br>DAP: <b>${f.dap.toFixed(0)} kg</b><br>MOP: <b>${f.mop.toFixed(0)} kg</b>
      <div class="small muted">Typical doses; adjust using a soil test and local agri‑dept guidance.</div></div>`;
  };

  // Diary
  const renderLog = () => {
    const L = store.get('log', []);
    $('logList').innerHTML = L.length ? L.slice().reverse().map(x => `<li><b>${escapeHTML(x.type)}</b> – ${escapeHTML(x.note)}<br><span class="muted small">${new Date(x.t).toLocaleString()}${x.lat ? ` · ${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}` : ''}</span></li>`).join('') : '<li class="muted">No entries yet.</li>';
  };
  $('btnLog').onclick = async () => {
    const L = store.get('log', []); const e = { type: $('logType').value, note: $('logNote').value, t: Date.now() };
    try { const p = await getPosition(); e.lat = p.coords.latitude; e.lon = p.coords.longitude; } catch { if (state.loc) { e.lat = state.loc.lat; e.lon = state.loc.lon; } }
    L.push(e); store.set('log', L); $('logNote').value = ''; renderLog();
  };
  $('btnExport').onclick = () => {
    const L = store.get('log', []); const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    const csv = 'time,type,note,lat,lon\n' + L.map(x => [new Date(x.t).toISOString(), x.type, x.note, x.lat, x.lon].map(q).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'farm-diary.csv'; a.click();
  };
  renderLog();

  // Voice assistant: SpeechRecognition (mic → text) + speechSynthesis (text → speech)
  const VOICE_EXAMPLES = {
    'en-IN': ['What is the weather?', 'Recommend crops', 'How much water for rice?', 'Fertilizer for wheat'],
    'hi-IN': ['आज मौसम कैसा है?', 'कौन सी फसल लगाऊं?', 'धान को कितना पानी चाहिए?', 'गेहूं के लिए खाद बताओ'],
    'ta-IN': ['இன்று வானிலை எப்படி?', 'எந்த பயிர் பயிரிடலாம்?', 'நெல்லுக்கு எவ்வளவு தண்ணீர்?', 'கோதுமைக்கு உரம் எவ்வளவு?'],
    'te-IN': ['ఈరోజు వాతావరణం ఎలా ఉంది?', 'ఏ పంట వేయాలి?', 'వరికి ఎంత నీరు కావాలి?', 'గోధుమకు ఎరువు ఎంత?']
  };
  const vLang = () => $('voiceLang').value;
  // Browsers load the voice list in the background; ask for it early so the first answer finds the right voice
  if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => speechSynthesis.getVoices()); }
  const LANG_NAME = { 'hi-IN': 'Hindi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu' };
  function speak(text, lang) {
    $('voiceNote').textContent = '';
    if (!('speechSynthesis' in window)) { $('voiceNote').textContent = 'Speech output not supported – showing text only.'; return; }
    const voices = speechSynthesis.getVoices();
    const v = voices.find(x => x.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) ||
              voices.find(x => x.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (!v && voices.length && lang !== 'en-IN') { $('voiceNote').textContent = `No ${LANG_NAME[lang] || ''} voice on this device, so the answer is shown as text. To hear it, open the app in Microsoft Edge or on an Android phone, or add the voice in Windows Settings → Time & language → Speech.`; return; }
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  function answer(text) {
    const lang = vLang();
    const season = $('season').value === 'auto' ? seasonOf() : $('season').value;
    const r = processVoiceCommand(text, lang, { wx: state.wx, season });
    $('voiceHeard').textContent = '“' + text + '”';
    $('voiceReply').textContent = r.reply;
    $('voiceReply').dataset.intent = r.intent;
    speak(r.reply, lang);
  }
  const renderExamples = () => {
    $('voiceExamples').innerHTML = VOICE_EXAMPLES[vLang()].map(x => `<button class="chip" type="button">${escapeHTML(x)}</button>`).join('');
    $('voiceExamples').querySelectorAll('button').forEach(b => b.onclick = () => answer(b.textContent));
  };
  $('voiceLang').onchange = renderExamples; renderExamples();
  $('btnAsk').onclick = () => { const t = $('voiceText').value.trim(); if (t) { answer(t); $('voiceText').value = ''; } };
  $('voiceText').onkeydown = e => { if (e.key === 'Enter') $('btnAsk').click(); };
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $('btnVoice').disabled = true;
    $('voiceStatus').textContent = 'Voice input is not supported in this browser – type your question below.';
  } else {
    let rec = null;
    $('btnVoice').onclick = () => {
      if (rec) { rec.stop(); return; }
      if (!navigator.onLine) { $('voiceStatus').textContent = 'Speech recognition needs internet – type your question below.'; return; }
      rec = new SR(); rec.lang = vLang(); rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => { $('btnVoice').classList.add('listening'); $('voiceStatus').textContent = 'Listening…'; };
      rec.onresult = e => answer(e.results[0][0].transcript);
      rec.onerror = e => { $('voiceStatus').textContent = e.error === 'not-allowed' ? 'Microphone permission denied.' : 'Could not hear you (' + e.error + '). Try again or type.'; };
      rec.onend = () => { $('btnVoice').classList.remove('listening'); if ($('voiceStatus').textContent === 'Listening…') $('voiceStatus').textContent = ''; rec = null; };
      rec.start();
    };
  }
}

if (typeof module !== 'undefined') module.exports = { CROPS, CROP_NAMES, seasonOf, scoreCrop, escapeHTML, classifyVoiceIntent, processVoiceCommand, recommend, irrigation, fertilizer, analyseLeaf, adviceFrom };
