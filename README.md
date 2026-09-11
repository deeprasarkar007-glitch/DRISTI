# Dumper Truck Detector

Detects whether a dumper truck is visible in your laptop's webcam feed, live, in the browser.

- **`model_training/`** — Jupyter notebook that trains a binary image classifier (dumper truck vs. not) on your own images, using transfer learning on MobileNetV2. Saves a `.keras` model (and a `.h5` copy).
- **`backend/`** — FastAPI service that loads the trained model and classifies webcam frames sent to it.
- **`frontend/`** — Next.js app that opens your webcam in the browser, sends a frame to the backend a few times a second, and shows "Dumper truck detected" / "Not detected" live.

How it fits together: the **browser** captures your webcam (no server-side camera access needed, so this works the same on any machine) and posts each captured frame to the FastAPI **backend**, which runs it through the trained model and returns a label + confidence.

---

## 0. Prerequisites (Windows)

Install these once, if you don't already have them:

- **Python 3.10 or newer** — https://www.python.org/downloads/windows/ (during install, check "Add python.exe to PATH")
- **Node.js 18 or newer** (includes npm) — https://nodejs.org/
- A webcam (built-in or USB), and a browser that can access it (Chrome or Edge both work well)

All commands below use **PowerShell**. Open it from the Start Menu, then `cd` into wherever you unzipped this project, e.g.:

```powershell
cd C:\Users\<you>\Desktop\dumper-truck-detector
```

---

## 1. Add your training images

Put your pictures into these two folders (create more subfolders is not needed — just these two):

```
model_training\image_data\dumper_truck\        <- photos that DO show a dumper truck
model_training\image_data\no_dumper_truck\     <- photos that do NOT show a dumper truck
```

JPEG, PNG, or a mix of both is fine. See `model_training/train_dumper_truck_classifier.ipynb` (top cell) for tips on how many images you want and what makes a good "no dumper truck" set (it should look like whatever your webcam normally sees).

---

## 2. Train the model

```powershell
cd model_training
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
jupyter lab
```

This opens Jupyter in your browser. Open `train_dumper_truck_classifier.ipynb` and run all cells (**Run > Run All Cells**). It will:

1. Load your images from `image_data\`
2. Train a classifier (a few minutes on CPU, faster with a GPU)
3. Show you accuracy/loss charts and a confusion matrix
4. Save the trained model into `model_training\saved_model\`
5. **Automatically copy it into `backend\saved_model\`**, where the API expects it

If you re-train later with more/better images, just re-run the notebook — it'll overwrite the model the backend uses (restart the backend afterward, see below).

> Note: leave `.venv` activated only in this PowerShell window; use a separate one for the backend/frontend steps below (or reactivate the right environment each time — they don't need to be the same virtual environment).

---

## 3. Run the backend

In a **new** PowerShell window:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/health in a browser — it should say `"model_loaded": true` once step 2 has produced a model. If it says `false`, double check `backend\saved_model\` contains `dumper_truck_model.keras` and `class_names.json`.

---

## 4. Run the frontend

In a **third** PowerShell window:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, allow camera access when your browser asks, and you should see your webcam feed with a live "Dumper truck detected" / "Not detected" status underneath, updating a few times a second.

By default the frontend talks to the backend at `http://localhost:8000`. If you ever run the backend on a different host/port, copy `frontend\.env.local.example` to `frontend\.env.local` and edit `NEXT_PUBLIC_API_URL`.

---

## Troubleshooting

- **"Model not trained yet" on the page** — the backend can't find a trained model. Finish step 2 (the notebook), confirm `backend\saved_model\dumper_truck_model.keras` and `class_names.json` exist, then restart the backend (Ctrl+C, run `uvicorn ...` again).
- **"Backend unreachable"** — make sure the `uvicorn` window from step 3 is still running and didn't crash, and that nothing else is using port 8000.
- **Browser won't show the camera / "Camera error"** — check Windows privacy settings (Settings > Privacy & security > Camera) allow desktop apps/your browser to use the camera, and that no other app (Teams, Zoom, etc.) is holding onto the webcam exclusively.
- **Low accuracy / false positives** — add more, more varied images to `model_training\image_data\` (especially more "no_dumper_truck" examples similar to what your webcam actually sees), then re-run the notebook.
- **Training is slow** — that's expected on CPU with a larger dataset; it still works, just give it a few minutes. Reduce `INITIAL_EPOCHS`/`FINE_TUNE_EPOCHS` in the notebook's config cell if you want faster (but less accurate) runs while iterating.

---

## Project structure

```
dumper-truck-detector/
├── model_training/
│   ├── image_data/
│   │   ├── dumper_truck/          <- your positive images go here
│   │   └── no_dumper_truck/       <- your negative images go here
│   ├── saved_model/               <- created by the notebook
│   ├── train_dumper_truck_classifier.ipynb
│   └── requirements.txt
├── backend/
│   ├── app/
│   │   ├── main.py                <- FastAPI app, /health and /predict
│   │   ├── model_service.py       <- loads the model, runs inference
│   │   └── schemas.py
│   ├── saved_model/               <- trained model files land here (from the notebook)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx
    ├── components/
    │   └── WebcamDetector.tsx     <- webcam capture + polling + status UI
    ├── package.json
    └── .env.local.example
```
