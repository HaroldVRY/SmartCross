# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SmartCross is an autonomous traffic-regulation prototype for intersections in San Isidro, Lima. It has three independently-developed modules that share state through a single Flask backend:

1. **Intersection detail / live detection** (`app.py`, root) — YOLOv8 vehicle detection over a drone video (or a built-in 2D traffic simulator when no video is present), per-access ROI counting, and a green-light-extension rules engine.
2. **Central control panel** (`app.py` + `templates/dashboard.html` + `static/js/dashboard.js`) — district-wide Leaflet map of all 8 intersections with draggable nodes, aggregated KPIs, and incident feed.
3. **Driver mobile app** (`driver-app/`) — Expo/React Native app that polls the Flask API for live traffic/GLOSA (green-wave speed advisory) guidance.

See [project_specifications.md](project_specifications.md) for the full module breakdown (file-by-file responsibilities) in Spanish — treat it as the authoritative spec when working on any of the three modules.

## Commands

### Backend (Flask + YOLOv8)
```bash
pip install -r requirements.txt   # Flask, opencv-python, ultralytics, numpy, pandas
python app.py                     # runs on http://localhost:5000
```
There is no test framework configured. The two `validate_*.py` scripts at the repo root are manual smoke-check scripts, not a test suite:
```bash
python validate_setup.py    # checks Python deps, config.py, rois.json/intersecciones.json shape, video file, OpenCV point-in-polygon logic
python validate_driver.py   # checks driver-app/package.json deps and App.js critical imports
```

### Driver app (Expo)
```bash
cd driver-app
npm install
npx expo start    # scan QR with Expo Go on a phone on the same Wi-Fi
```
Before touching `driver-app/`, read [driver-app/AGENTS.md](driver-app/AGENTS.md) — it states Expo's API has changed and instructs reading the versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo code in this directory (note: `driver-app/package.json` currently pins `expo@54.0.8`).

## Architecture

### Single Flask process, one background thread
`app.py` runs one daemon thread (`video_processing_thread`, started via `@app.before_request` / in `__main__`) that owns the entire vision + simulation pipeline. All Flask routes only read from or write to thread-safe global state guarded by locks — they never do CV work themselves:

- `frame_lock` / `latest_frame` — current JPEG frame served by `/video_feed` (MJPEG multipart stream).
- `status_lock` / `latest_status` — per-access (`S1`–`S4`) congestion status, smoothed counts, KPIs; served by `/api/status`.
- `intersections_lock` / `intersections_data` — in-memory cache of the 8 district intersections, periodically persisted to `intersecciones.json`; served by `/api/intersecciones`.
- `intersection_lock` / `current_active_intersection` — which intersection the camera/simulation is currently representing; switched when a user opens `/interseccion/<id>`.

### Real video vs. synthetic simulation fallback
On startup the thread checks for `data/video.mp4`. If present, it loads `yolov8n.pt` via Ultralytics and runs real inference (`COCO_CLASSES = [2,3,5,7]` → car/motorcycle/bus/truck). If absent or YOLO/video fails to load, it falls back to `TrafficSimulator` + `SimulatedVehicle`, a hand-rolled 2D traffic simulation (spawns vehicles per lane, respects a 2-phase light cycle NS_GREEN/EW_GREEN, includes closed-loop green-light extension when a lane is ROJO). Both paths produce the same `detections` list shape (`box`, `class_id`, `conf`) so the downstream ROI/counting/drawing pipeline is shared code regardless of source.

### ROI pipeline
ROIs are stored as **relative** (0.0–1.0) polygon coordinates per access (`S1`–`S4`) in `rois.json`, loaded fresh every frame (`load_rois()`) so edits made in the `/setup` UI take effect without restarting the server. Each frame: ROIs are scaled to the 960×540 render size, vehicle centroids are tested with `cv2.pointPolygonTest`, raw per-access counts are smoothed with a moving average (`deque(maxlen=config.SMOOTHING_FRAMES)`), then classified VERDE/AMARILLO/ROJO against `config.UMBRAL_BAJO`/`UMBRAL_ALTO`. ROJO accesses get a recommended extra-green-time value (`config.BASE_EXTRA_TIME + ... `, capped at `MAX_EXTRA_TIME`) and a human-readable Spanish action string.

### Data persistence
There is no database. State lives in two flat JSON files, both self-healing (regenerated with defaults if missing/corrupt):
- `rois.json` — polygon config per access, read/written via `/api/get_rois` and `/api/save_rois` (used by the `/setup` canvas editor).
- `intersecciones.json` — the 8 district nodes (`id`, `name`, `lat`, `lng`, `status`, `count`, `corridor`); the active node is synced in real time from the vision/simulation pipeline, inactive nodes fluctuate randomly every ~90 frames and are flushed to disk on that cadence (`/api/update_interseccion_coords` lets the dashboard map persist drag-and-drop position edits).

### Frontend
No build step — `templates/*.html` + `static/js/*.js` are plain Jinja2 + vanilla JS, polling JSON endpoints (`/api/status`, `/api/intersecciones`) every ~500ms. `static/js/setup.js` drives the ROI polygon canvas; `static/js/dashboard.js` drives the Leaflet district map; `static/js/main.js` drives the per-intersection detail view (`templates/interseccion.html`).

### Driver app ↔ backend
`driver-app/App.js` is a single-file Expo app. It can run fully offline against `DEFAULT_INTERSECTIONS`/`DEMO_WAYPOINTS` fallback data, or connect to the Flask backend's LAN IP (entered in the in-app Settings tab) to consume live `/api/intersecciones`-style data — there is no dedicated mobile API, it talks to the same endpoints as the dashboard. Map rendering reuses Leaflet inside a `WebView` (`LEAFLET_MAP_HTML` string injected into the WebView), not a native map component.
