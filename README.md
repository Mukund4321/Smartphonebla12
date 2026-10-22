# 🌾 Smart Agri Assistant

> A mobile-first, offline-capable **Progressive Web App (PWA)** that turns a smartphone into a pocket crop advisor.
> Built for the subject **Smartphone Computation**.

**Live demo:** https://dc2xx4.github.io/smartphonebla1/
**Source code:** https://github.com/DC2XX4/smartphonebla1

---

## 1. Problem Statement

Small and marginal farmers often lack quick access to:
- hyper-local weather and spray/irrigation timing,
- guidance on which crop suits their soil and season,
- early signs of crop stress,
- a simple record of what they did on the field.

Most farmers already own a smartphone, and the phone already contains the sensors and processing power needed to help. **Smart Agri Assistant** uses those built-in capabilities, with no extra hardware and no app-store install.

## 2. Objectives

1. Use real smartphone hardware and APIs (GPS, camera, network, storage) in a useful application.
2. Run computation **on the device**, so it works with poor or no connectivity and keeps farmer data private.
3. Deliver an installable app using only web technologies (HTML, CSS, JavaScript).

## 3. Features

| # | Module | What it does | Smartphone capability used |
|---|--------|--------------|----------------------------|
| 1 | **Home / Weather** | Gets the field location, shows temperature, humidity, wind and rain, a 7-day forecast, and rule-based advice (skip irrigation, avoid spraying in wind, fungal-risk and frost/heat alerts) | GPS (Geolocation API), network (Open-Meteo API, no key needed) |
| 2 | **Crop Recommender** | Scores 12 crops out of 100 against soil type, pH, season, water availability and temperature, and shows the top 4 with reasons | On-device computation |
| 3 | **Leaf Health Scan** | Takes a leaf photo and calculates the share of green, yellow and brown pixels, then gives a health score and a suggested cause | Camera + Canvas image processing (photo never leaves the phone) |
| 4 | **Fertilizer & Irrigation Calculator** | Computes daily water need from evapotranspiration × crop coefficient, and Urea / DAP / MOP quantities for the field area | On-device computation, live ET₀ data |
| 5 | **Farm Diary** | Logs sowing, irrigation, fertilizer, pesticide and harvest with time and GPS stamp, and exports to CSV | localStorage, GPS |
| 6 | **Offline + Installable** | Loads with no internet and can be added to the home screen like a native app | Service Worker, Web App Manifest, online/offline events |

## 4. System Architecture

```
┌────────────────────────── Smartphone / Browser ──────────────────────────┐
│                                                                           │
│  UI layer           index.html + style.css  (5-tab mobile interface)      │
│                                                                           │
│  Logic layer        app.js                                                │
│   ├─ Crop scoring engine        ├─ Leaf pixel-analysis                    │
│   ├─ ET₀ irrigation model       ├─ Fertilizer calculator                  │
│   └─ Weather advice rules       └─ Diary + CSV export                     │
│                                                                           │
│  Device APIs        Geolocation · Camera/File · Canvas · localStorage     │
│                                                                           │
│  Offline layer      sw.js (Service Worker cache) + manifest.webmanifest   │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ HTTPS (only when online)
                ▼
        Open-Meteo Weather API  (free, no API key)
```

Hosting: static files on **GitHub Pages**, deployed automatically by a **GitHub Actions** workflow on every push.

## 5. How Each Algorithm Works

### 5.1 Crop recommendation (score out of 100)
| Factor | Max points |
|---|---|
| Temperature within the crop's ideal range (partial credit, reduced 5 points per °C outside) | 30 |
| Soil pH within range (partial credit nearby) | 20 |
| Soil type suits the crop | 20 |
| Crop belongs to the selected season (Kharif / Rabi / Zaid) | 20 |
| Water availability meets crop demand | 10 |

The season is detected automatically from the current date. The temperature comes from live weather unless the user types one.

### 5.2 Leaf health scan
Each pixel of the photo is classified by its RGB values:
- **Green** → healthy tissue
- **Yellow** → possible chlorosis (nitrogen/iron deficiency or overwatering)
- **Brown** → possible necrosis / disease spots
- Dark, white and grey pixels are ignored (soil, sky, background).

`Health score = 100 − (yellow% + 1.5 × brown%)`, and the app gives advice based on the dominant colour.
*This is a screening heuristic, not a trained disease classifier.*

### 5.3 Irrigation
```
Water need (mm/day) = ET₀ × Kc − 0.8 × expected rain
Litres/day          = mm/day × 4046.86 × acres
```
ET₀ is the reference evapotranspiration from the weather API, and Kc is the crop coefficient for the growth stage (initial 0.5, mid-season 1.1, and so on).

### 5.4 Fertilizer
Crop nutrient targets (N, P₂O₅, K₂O in kg/acre) are converted into products:
- **DAP** (18% N, 46% P₂O₅) is sized to meet phosphorus,
- **Urea** (46% N) supplies the remaining nitrogen after the nitrogen in DAP is subtracted,
- **MOP** (60% K₂O) supplies potassium.

## 6. Technologies Used
- **HTML5 / CSS3 / vanilla JavaScript**, with no frameworks and no build step
- **Web APIs:** Geolocation, Canvas, File/Camera capture, localStorage, Service Worker, Web App Manifest, Online/Offline events
- **Open-Meteo REST API** for weather and ET₀
- **GitHub Pages + GitHub Actions** for deployment

## 7. Project Structure
```
smart-agri-assistant/
├── index.html               # UI structure (5 tabs)
├── style.css                # Mobile-first, dark-mode aware styling
├── app.js                   # All logic: crops, leaf scan, calculators, diary
├── sw.js                    # Service worker (offline cache)
├── manifest.webmanifest     # PWA install metadata
├── icon.svg                 # App icon
├── README.md                # This file
└── .github/workflows/pages.yml   # Auto-deploy to GitHub Pages
```

## 8. Running the Project

**On your computer (VS Code):**
1. Open the folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` → **Open with Live Server**.

**Or from a terminal:**
```bash
python -m http.server 8080
# open http://localhost:8080
```

> Open it through `localhost` or `https`, not by double-clicking the file. GPS, camera and the service worker are blocked on `file://`.

**On a phone:** open the live demo link, allow location and camera, then use the browser menu → **Add to Home Screen**.

## 9. Demo Script (for presentation)
1. Open the app and tap **Use my GPS location** → show live weather and advice.
2. Go to **Crops**, choose Clay soil, pH 6.5, Kharif, High water → show Rice at the top.
3. Go to **Leaf** and upload a green leaf, then a yellowing leaf → compare the scores.
4. Go to **Calc**, choose Wheat for 2 acres → show fertilizer and irrigation numbers.
5. Go to **Diary**, save an entry and show the GPS stamp, then export the CSV.
6. Turn on airplane mode (or DevTools → Network → Offline) and reload → the app still works.

## 10. Why This Is "Smartphone Computation"
- **Sensing:** GPS and the camera act as input sensors.
- **Edge computing:** the scoring, image analysis and calculations run on the phone's CPU, not on a server.
- **Connectivity-aware:** it uses the network when it exists and falls back to cached data when it does not.
- **Local storage and privacy:** diary and photos stay on the device.
- **Cross-platform delivery:** one codebase runs on Android, iOS and desktop through the browser.

## 11. Limitations and Future Scope
**Limitations**
- Leaf analysis uses colour thresholds, so lighting and background affect it.
- Fertilizer doses are typical values, not soil-test-based.
- The crop list covers 12 common crops.

**Future work**
- Replace the leaf heuristic with an on-device TensorFlow.js disease model.
- Add soil moisture or IoT sensor input over Bluetooth.
- Add regional-language and voice support for farmers.
- Add market price tracking and push notifications for weather alerts.
- Sync the diary to the cloud.

## 12. Disclaimer
Advice is for guidance only. Confirm fertilizer, pesticide and crop decisions with a local agriculture officer.

## 13. Author
*Dharshini Chellam*
