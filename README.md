# DRISTI (Vantage Mission Control)

> **Safe and Efficient Operation of Mine Vehicles in Fog & Low-Visibility Conditions in Open Cast Iron Ore Mines**

---

## Overview

**DRISTI** (Dynamic Radar & Infrared Safety Telemetry Interface) is an autonomous collision avoidance, atmospheric monitoring, and haul-road safety platform designed specifically for open-cast iron ore mining operations. 

It combines real-time optical AI vision, ESP32 ToF radar telemetry, dynamic atmospheric fog analysis, and interactive GIS corridor mapping to prevent vehicle collisions in dense monsoon fog, dust storms, and steep haul road inclines.

---

## Core System Architecture

### 1. Mission Control Glass HUD (`http://localhost:8080`)
- **Vivid Glassmorphism Interface**: Crystal-clear frosted glass layout framed over dynamic cinematic background video.
- **Strict 3-Color High-Contrast Palette**: 
  - **Monochrome White** (`#ffffff`): Primary readouts, mine titles, and operational metrics.
  - **Electric Cyan** (`#22d3ee`): Active radar sweeps, safe haul road status, and system telemetry.
  - **Warning Amber** (`#fbbf24`): Proximity hazards, fog alerts, and low visibility warnings.

### 2. Real-Time AI Optical Vision (`POST /predict`)
- **MobileNetV2 Inference**: High-speed frame classification identifying heavy mining dumpers (CAT/Komatsu fleet).
- **Auto-Hardware Binding**: Binds to connected USB/webcam streams or hardware camera feeds.
- **Dynamic Optical Stream Fallback**: Automatic optical haul-road stream generator for real-time model evaluation when hardware is standby.
- **Target Locking Reticle**: Visual reticle lock with confidence percentage (`LOCK 94%`) and bounding frame.

### 3. ESP32 Sensor Telemetry & Radar Arc Sweep (`GET /telemetry`)
- **ToF Laser Distance Arc**: 60 FPS continuous radar sweep beam with color-coded arc bounds (`SAFE` > 200mm vs `WARNING` <= 200mm).
- **Atmospheric Heuristics**: Multi-sensor correlation evaluating Humidity (DHT22), Ambient Light (Lux), and Temperature. Automatically triggers **FOG ALERT** when Humidity >= 75% and Light <= 100 Lux.

### 4. Dynamic Mobile Cellular Network RSSI Status HUD
- **4-Bar Mobile Signal Meter**: Ascending vertical cellular signal bars (`bar-1` to `bar-4`) with rounded caps.
- **Live Data Activity Arrows (`▲` TX / `▼` RX)**: Animated uplink/downlink indicators that pulse on telemetry transmission.
- **Organic RF Propagation Jitter**: Real-time propagation loop evaluating signal strength, dBm readouts (`-68 dBm` to `-73 dBm`), and signal quality percentages (`92% Signal`).

### 5. Interactive OpenStreetMap (OSM) India Iron Mines GIS
- **Authentic Mining Dataset**: Verified data for India's major iron ore operations (Bailadila, Noamundi, Joda East, Kiriburu, Donimalai, Dalli-Rajhara, Jajang, Kumaraswamy, Bolani, Surjagarh, Gua, Kudremukh).
- **Square-Proportioned GIS View**: OpenStreetMap Leaflet layer framing India's mining corridors with Dark GIS and Standard OSM tile toggles.
- **Clean Metric Panels**: Displays Fe Grade %, MTPA Capacity, Reserves, Operator, Fleet, and Hazard classifications with zero clutter.

---

## One-Click Execution (`.bat` Scripts)

### Start All Services: `run.bat`
Double-click `run.bat` or run from PowerShell:
```cmd
.\run.bat
```
This automatically launches:
1. **Backend Service** (FastAPI on `http://127.0.0.1:8000`)
2. **Mission Control Dashboard** (Vantage on `http://localhost:8080`)
3. **Next.js Control Panel** (Frontend on `http://localhost:3000`)

### Stop All Services: `stop.bat`
Double-click `stop.bat` or run from PowerShell:
```cmd
.\stop.bat
```
Terminates all listening processes on ports `8000`, `8080`, and `3000` cleanly.

---

## Manual Installation & Run

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & `npm`

### 1. Backend Setup
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate      # On Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Vantage Mission Control Dashboard
```bash
python -m http.server 8080 --directory vantage
```
Open `http://localhost:8080` in any modern web browser.

---

## API Reference (`http://127.0.0.1:8000`)

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/health` | `GET` | System health check and model loading status |
| `/telemetry` | `GET` | Fetch latest ESP32 distance, atmospheric & proximity data |
| `/telemetry` | `POST` | Update live telemetry payload from ESP32 node |
| `/telemetry/reset` | `POST` | Reset telemetry values to baseline safety state |
| `/predict` | `POST` | Upload frame JPEG (`multipart/form-data`) for MobileNetV2 prediction |

---

## License & Operational Scope
Designed for autonomous haulage safety and low-visibility collision avoidance in open-cast mining operations.