// End-to-end (black-box) tests with Playwright. Run: npx playwright test   (report: npx playwright show-report)
const { test, expect } = require('@playwright/test');

// Fixed GPS position (Mathura, UP) and a fixed weather response so results are repeatable
const GPS = { latitude: 27.4924, longitude: 77.6737 };
const weather = (o = {}) => ({
  current: { temperature_2m: 33, relative_humidity_2m: 40, wind_speed_10m: 25, precipitation: 0, ...o },
  daily: {
    time: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'],
    temperature_2m_max: [34, 33, 32, 31, 30, 31, 32], temperature_2m_min: [20, 19, 19, 18, 18, 19, 20],
    precipitation_sum: [0, 0, 2, 0, 0, 0, 0], et0_fao_evapotranspiration: [5, 5, 4, 4, 4, 5, 5],
  },
});

test.use({ geolocation: GPS, permissions: ['geolocation'] });

const tab = (page, name) => page.locator('nav button', { hasText: name }).click();

test.beforeEach(async ({ page }) => {
  await page.route('**/api.open-meteo.com/**', r => r.fulfill({ json: weather() }));
  await page.goto('/');
});

test('TC-42 app loads with header, online status and 6 navigation tabs', async ({ page }) => {
  await expect(page).toHaveTitle('Smart Agri Assistant');
  await expect(page.locator('header h1')).toContainText('Smart Agri Assistant');
  await expect(page.locator('#net')).toHaveText('online');
  await expect(page.locator('nav button')).toHaveCount(6);
});

test('TC-43 GPS + weather: shows coordinates, 4 weather stats, advice and 7-day forecast', async ({ page }) => {
  await page.click('#btnLocate');
  await expect(page.locator('#locText')).toContainText('27.4924, 77.6737');
  await expect(page.locator('#weather .stat')).toHaveCount(4);
  await expect(page.locator('#weather')).toContainText('33°C');
  await expect(page.locator('#advice')).toContainText('Hot & dry');          // 33 °C, 0 mm rain
  await expect(page.locator('#advice')).toContainText('avoid pesticide');    // wind 25 km/h
  await expect(page.locator('#forecast .day')).toHaveCount(7);
});

test('TC-44 crop recommender: clay, pH 6.5, kharif, high water, 27 °C → Rice 100/100 first', async ({ page }) => {
  await tab(page, 'Crops');
  await page.selectOption('#soil', 'clay');
  await page.selectOption('#season', 'kharif');
  await page.selectOption('#water', 'high');
  await page.fill('#tempIn', '27');
  await page.click('#btnRecommend');
  await expect(page.locator('#cropResults .res')).toHaveCount(4);
  await expect(page.locator('#cropResults .res').first()).toContainText('1. Rice — 100/100');
});

test('TC-45 calculator: Wheat, 2 acres, mid season → Urea 168, DAP 104, MOP 53 kg', async ({ page }) => {
  await tab(page, 'Calc');
  await page.selectOption('#calcCrop', 'Wheat');
  await page.fill('#area', '2');
  await page.click('#btnCalc');
  const r = page.locator('#calcResult');
  await expect(r).toContainText('Urea: 168 kg');
  await expect(r).toContainText('DAP: 104 kg');
  await expect(r).toContainText('MOP: 53 kg');
  await expect(r).toContainText('5.5 mm/day');
});

test('TC-46 calculator rejects zero / negative area (BUG-002 regression)', async ({ page }) => {
  await tab(page, 'Calc');
  for (const v of ['0', '-2']) {
    await page.fill('#area', v);
    await page.click('#btnCalc');
    await expect(page.locator('#calcResult')).toContainText('greater than 0');
    await expect(page.locator('#calcResult')).not.toContainText('Urea');
  }
});

test('TC-47 diary: saving an entry stores activity, note and GPS stamp; survives reload', async ({ page }) => {
  await tab(page, 'Diary');
  await page.selectOption('#logType', 'Fertilizer');
  await page.fill('#logNote', '20 kg urea, north plot');
  await page.click('#btnLog');
  const first = page.locator('#logList li').first();
  await expect(first).toContainText('Fertilizer');
  await expect(first).toContainText('20 kg urea, north plot');
  await expect(first).toContainText('27.492, 77.674');
  await page.reload(); await tab(page, 'Diary');
  await expect(page.locator('#logList li').first()).toContainText('20 kg urea');
});

test('TC-48 security: HTML/script in a diary note is shown as text, never executed (BUG-001 regression)', async ({ page }) => {
  let dialog = false; page.on('dialog', d => { dialog = true; d.dismiss(); });
  await tab(page, 'Diary');
  await page.fill('#logNote', '<img src=x onerror="alert(1)">');
  await page.click('#btnLog');
  await expect(page.locator('#logList li').first()).toContainText('<img src=x onerror="alert(1)">');
  await expect(page.locator('#logList img')).toHaveCount(0);
  expect(dialog).toBe(false);
});

test('TC-49 diary CSV export downloads farm-diary.csv with header and the entry', async ({ page }) => {
  await tab(page, 'Diary');
  await page.fill('#logNote', 'sowing test');
  await page.click('#btnLog');
  await expect(page.locator('#logList li').first()).toContainText('sowing test');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExport')]);
  expect(dl.suggestedFilename()).toBe('farm-diary.csv');
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(csv.split('\n')[0]).toBe('time,type,note,lat,lon');
  expect(csv).toContain('"sowing test"');
});

test('TC-50 leaf scan: uploaded green leaf photo is analysed on-device → health 100/100', async ({ page }) => {
  // Generate a green "leaf" PNG inside the browser, then upload it through the file input
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = 'rgb(40,160,40)'; x.fillRect(0, 0, 64, 64);
    return c.toDataURL('image/png').split(',')[1];
  });
  await tab(page, 'Leaf');
  await page.setInputFiles('#leafFile', { name: 'leaf.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await expect(page.locator('#leafCanvas')).toBeVisible();
  await expect(page.locator('#leafResult')).toContainText('Health score: 100/100');
  await expect(page.locator('#leafResult')).toContainText('Leaf looks healthy');
});

test('TC-51 weather API failure (HTTP 500) shows a clear message instead of crashing', async ({ page }) => {
  await page.unroute('**/api.open-meteo.com/**');
  await page.route('**/api.open-meteo.com/**', r => r.fulfill({ status: 500, body: 'error' }));
  await page.click('#btnLocate');
  await expect(page.locator('#locText')).toContainText('weather unavailable');
});

test('TC-52 GPS denied → user sees "GPS failed" message', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) => err({ code: 1, message: 'User denied Geolocation' });
  });
  await page.reload();
  await page.click('#btnLocate');
  await expect(page.locator('#locText')).toContainText('GPS failed: User denied Geolocation');
});

test('TC-53 offline: after first visit the app reloads with no network and shows "offline"', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);   // service worker installed + files cached
  await page.reload();                                        // page now controlled by the service worker
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('header h1')).toContainText('Smart Agri Assistant');
  await expect(page.locator('#net')).toHaveText('offline');
  await expect(page.locator('nav button')).toHaveCount(6);
  await context.setOffline(false);
});

// ---------- Voice assistant ----------
// Fake microphone: replaces the browser's SpeechRecognition with one that "hears" a fixed sentence,
// and records what the app asks speechSynthesis to say.
const fakeVoice = heard => {
  window.__spoken = [];
  window.SpeechRecognition = class {
    start() { setTimeout(() => { this.onstart && this.onstart(); this.onresult({ results: [[{ transcript: heard }]] }); this.onend && this.onend(); }, 50); }
    stop() {}
  };
  window.speechSynthesis.speak = u => window.__spoken.push({ text: u.text, lang: u.lang });
  window.speechSynthesis.getVoices = () => [];
};

test('TC-67 voice tab: mic → speech recognised → answer shown and spoken (English, with live weather)', async ({ page }) => {
  await page.addInitScript(fakeVoice, 'What is the weather?');
  await page.reload();
  await page.click('#btnLocate');
  await expect(page.locator('#weather .stat')).toHaveCount(4);
  await tab(page, 'Voice');
  await page.click('#btnVoice');
  await expect(page.locator('#voiceHeard')).toContainText('What is the weather?');
  await expect(page.locator('#voiceReply')).toContainText('Temperature 33 degrees');
  await expect(page.locator('#voiceReply')).toContainText('do not spray');
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken[0].lang).toBe('en-IN');
  expect(spoken[0].text).toContain('Temperature 33 degrees');
});

test('TC-68 voice tab in Hindi: "धान को कितना पानी चाहिए?" → Hindi answer spoken with hi-IN', async ({ page }) => {
  await page.addInitScript(fakeVoice, 'धान को कितना पानी चाहिए?');
  await page.reload();
  await tab(page, 'Voice');
  await page.selectOption('#voiceLang', 'hi-IN');
  await page.click('#btnVoice');
  await expect(page.locator('#voiceReply')).toContainText('चावल को रोज़ लगभग 7.7 मिलीमीटर पानी');
  expect((await page.evaluate(() => window.__spoken))[0].lang).toBe('hi-IN');
});

test('TC-69 Tamil and Telugu example chips answer in the selected language', async ({ page }) => {
  await page.addInitScript(fakeVoice, '');
  await page.reload();
  await tab(page, 'Voice');
  await page.selectOption('#voiceLang', 'ta-IN');
  await page.locator('#voiceExamples button', { hasText: 'உரம்' }).click();
  await expect(page.locator('#voiceReply')).toContainText('யூரியா 84 கிலோ');
  await page.selectOption('#voiceLang', 'te-IN');
  await page.locator('#voiceExamples button', { hasText: 'ఎరువు' }).click();
  await expect(page.locator('#voiceReply')).toContainText('యూరియా 84 కిలోలు');
});

test('TC-70 browser without speech recognition: mic disabled, typed question still answered', async ({ page }) => {
  await page.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  await page.reload();
  await tab(page, 'Voice');
  await expect(page.locator('#btnVoice')).toBeDisabled();
  await expect(page.locator('#voiceStatus')).toContainText('not supported');
  await page.fill('#voiceText', 'Fertilizer for wheat');
  await page.click('#btnAsk');
  await expect(page.locator('#voiceReply')).toContainText('urea 84 kilograms');
});

test('TC-71 typed HTML in the voice box is shown as text (no XSS)', async ({ page }) => {
  let dialog = false; page.on('dialog', d => { dialog = true; d.dismiss(); });
  await tab(page, 'Voice');
  await page.fill('#voiceText', '<img src=x onerror="alert(1)">');
  await page.click('#btnAsk');
  await expect(page.locator('#voiceHeard')).toContainText('<img src=x');
  await expect(page.locator('#tab-voice img')).toHaveCount(0);
  expect(dialog).toBe(false);
});
