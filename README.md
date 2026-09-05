# Kavach AI — Public Safety Intelligence Platform

**Live demo: https://kavach-ai-self.vercel.app**

Four integrated anti-fraud modules behind one command-center dashboard. Every verdict in the
UI is produced by a real, inspectable engine — no mocked model output.

| Module | What it is | Engine |
|---|---|---|
| **M1 Scam Detector** | Line-by-line scam-call analysis with a full audit trail | Explainable weighted rule engine (deterministic, court-auditable evidence spans) |
| **M2 Counterfeit Scanner** | Upload a note photo → genuine/counterfeit verdict | MobileNetV3-Small fine-tuned on a public real/fake Indian currency dataset, ONNX CPU inference |
| **M3 Fraud Graph** | Mule-ring visualization with per-account risk | GraphSAGE trained on a simulated PaySim-schema ledger (provenance shown in UI) |
| **M4 Citizen Shield** | WhatsApp-style multilingual scam advisor (EN/HI/KN/TA/TE) | Gemini 2.5 Flash + TF-IDF retrieval over curated RBI/I4C advisories; deterministic fallback without a key |
| **Command Center** | National threat heatmap + intercept feed + evidence export | Leaflet heatmap over curated hotspot districts; SHA-256 hash-stamped evidence packages |

## Design principles

- **Honest by construction.** The health endpoint (`/api/health`) reports what's actually loaded;
  the UI status pill reflects it. Missing model → 503 with instructions, never a fake verdict.
- **Explainability as the product.** M1 deliberately uses rules instead of a neural net:
  every score decomposes into matched evidence spans with character offsets — the property
  that makes output legally admissible.
- **Provenance everywhere.** M2/M3 verdicts carry dataset, training date, and held-out
  metrics produced by the actual training runs in `ml/`.

## Run it

Backend (Python 3.11+):
```bash
cd backend
python -m venv .venv && .venv/Scripts/activate    # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                              # add GEMINI_API_KEY (optional)
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+):
```bash
cd frontend
npm install
npm run dev                                        # http://localhost:5173
```

Deployment: set `VITE_API_URL` in the frontend environment to the deployed backend origin.

## Train the models (already trained artifacts are committed)

```bash
python -m venv ml/.venv && ml/.venv/Scripts/activate
pip install -r ml/requirements.txt

# M2 — counterfeit detector (needs the dataset, see ml/datasets/README)
python ml/m2_train.py

# M3 — GraphSAGE fraud graph
python ml/m3_graph_train.py
```

Artifacts land in `backend/app/resources/` and are picked up on backend restart.

## Repository layout

```
backend/   FastAPI app — routers, services, curated knowledge bases (app/data/)
frontend/  Vite + React 19 dashboard (Leaflet map, SVG graph, WhatsApp-style chat)
ml/        Training scripts for M2 (ONNX vision model) and M3 (GraphSAGE graph)
```
