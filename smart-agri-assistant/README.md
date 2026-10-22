# 🌾 Smart Agri Assistant

A mobile-first, installable (PWA) crop assistant built for a **Smartphone Computation** course. It runs entirely in the browser, works offline, and uses real phone hardware/APIs.

## Features
| Feature | Smartphone capability used |
|---|---|
| Field location + live weather, 7‑day forecast, spray/irrigation advice | GPS (Geolocation API), network (Open‑Meteo, no key) |
| Crop recommender (soil, pH, season, water, temperature scoring) | On‑device computation |
| Leaf health scan (green/yellow/brown pixel analysis) | Camera + Canvas image processing, no upload |
| Fertilizer (Urea/DAP/MOP) & irrigation (ET₀×Kc) calculator | On‑device computation |
| Farm diary with GPS‑stamped entries, CSV export | localStorage, GPS |
| Offline use + "Add to Home Screen" | Service Worker, Web App Manifest |

## Run locally
```bash
python3 -m http.server 8080   # then open http://localhost:8080
```
(Geolocation/camera/service worker need `https://` or `localhost`.)

## Deploy (GitHub Pages)
Push to `main`; the included workflow `.github/workflows/pages.yml` publishes it at
`https://<your-username>.github.io/smart-agri-assistant/`.
If the first run fails, go to **Settings → Pages → Source: GitHub Actions** and re-run.

## Test logic
```bash
node -e "console.log(require('./app.js').recommend({soil:'loam',ph:6.5,season:'rabi',water:'med',temp:18}))"
```

## Limitations
Leaf analysis is a colour heuristic, not a trained disease model; fertilizer doses are typical values. Always confirm with local agricultural guidance.
