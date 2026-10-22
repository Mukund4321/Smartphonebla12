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
    const crop = $('calcCrop').value, area = +$('area').value || 1, kc = +$('stage').value;
    const w = state.wx || { et0: CROPS[crop].et, rainNext24: 0 };
    const ir = irrigation(crop, kc, w.et0, w.rainNext24, area), f = fertilizer(crop, area);
    $('calcResult').innerHTML = `<div class="res"><b>💧 Irrigation (today)</b><br>${ir.mmPerDay.toFixed(1)} mm/day ≈ <b>${Math.round(ir.litresPerDay).toLocaleString()} L</b> for ${area} acre${state.wx ? '' : ' <span class="muted small">(get GPS for live ET₀/rain)</span>'}</div>
      <div class="res"><b>🧪 Fertilizer for ${crop} (full season)</b><br>Urea: <b>${f.urea.toFixed(0)} kg</b><br>DAP: <b>${f.dap.toFixed(0)} kg</b><br>MOP: <b>${f.mop.toFixed(0)} kg</b>
      <div class="small muted">Typical doses; adjust using a soil test and local agri‑dept guidance.</div></div>`;
  };

  // Diary
  const renderLog = () => {
    const L = store.get('log', []);
    $('logList').innerHTML = L.length ? L.slice().reverse().map(x => `<li><b>${x.type}</b> – ${x.note || ''}<br><span class="muted small">${new Date(x.t).toLocaleString()}${x.lat ? ` · ${x.lat.toFixed(3)}, ${x.lon.toFixed(3)}` : ''}</span></li>`).join('') : '<li class="muted">No entries yet.</li>';
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
}

if (typeof module !== 'undefined') module.exports = { CROPS, seasonOf, recommend, irrigation, fertilizer, analyseLeaf, adviceFrom };
