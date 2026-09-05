# Kavach AI — Complete Project Documentation

**Live demo:** https://kavach-ai-self.vercel.app
**Repository:** https://github.com/MMH5429/kavach-ai
**Stack:** FastAPI (Python) · React 19 + Vite · ONNX Runtime · PyTorch (training) · Gemini API · Leaflet

---

## 1. What Kavach Is

Kavach (कवच, "armor") is a public-safety intelligence platform targeting digital fraud in
India — digital-arrest call scams, counterfeit currency, mule-account money laundering, and
WhatsApp/SMS phishing. It has two faces:

- **A command-center dashboard** for analysts: a national threat heatmap, live intercept
  feed, fraud-network graph, and court-oriented evidence export.
- **Citizen-facing tools**: a scam-call analyzer, a currency-note scanner, and a
  multilingual fraud-advice chatbot.

**The design thesis — evidence, not vibes.** Every verdict on screen is produced by a real,
inspectable engine and carries its own provenance (what produced it, trained on what, when,
with what measured accuracy). Nothing is mocked: if a model isn't loaded, the API returns
503 with instructions rather than a fake answer, and the UI status pill says so.

---

## 2. System Architecture

```
┌────────────────────────── Frontend (React 19 + Vite, :5173) ─────────────────────────┐
│  Command Center · Scam Detector (M1) · Counterfeit (M2) · Fraud Graph (M3) ·         │
│  Citizen Shield (M4) · Evidence Export modal                                         │
│  src/api.js — central API base (VITE_API_URL env var, localhost fallback)            │
│  src/resultsStore.js — session verdict store feeding the evidence export             │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │ JSON over HTTP (/api/*)
┌──────────────────────────────────────▼──────────────── Backend (FastAPI, :8000) ─────┐
│  routers/api.py — thin endpoint layer                                                │
│  services/                                                                           │
│    scam_rules.py      M1 — explainable weighted rule engine                          │
│    counterfeit.py     M2 — ONNX MobileNetV3 inference                                │
│    graph_service.py   M3 — serves GraphSAGE training artifact                        │
│    shield_bot.py      M4 — TF-IDF retrieval + Gemini (rules fallback)                │
│    alerts.py          heatmap points + rotating intercept feed                       │
│    evidence.py        SHA-256 hash-stamped intelligence packages                     │
│  data/       curated knowledge bases (scam_rules, hotspots, advisories JSON)         │
│  resources/  trained artifacts (counterfeit_mnv3.onnx, fraud_network_data.json)      │
└──────────────────────────────────────────────────────────────────────────────────────┘
        ▲ artifacts produced offline by
┌───────┴──────────────────────────────────────────────────────────────────────────────┐
│  ml/m2_train.py — fine-tunes MobileNetV3-Small, exports ONNX + metrics               │
│  ml/m3_graph_train.py — trains GraphSAGE on simulated ledger, exports graph JSON     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Honesty contract:** `GET /api/health` reports the true runtime state
(`onnx_model_loaded`, `gemini_configured`, `graph_data.present`) and the header status
pill renders exactly that.

---

## 3. Module M1 — Scam Call Interceptor

### What it is
A simulated scam-call player (left panel) feeding a **live risk analysis** (right panel).
Four scripted call profiles reproduce documented scam patterns: FedEx/narcotics customs,
CBI money-laundering threat, TRAI SIM suspension, plus a legitimate control call. Lines
appear one at a time; after each line the accumulated transcript is re-analyzed by the
backend in real time.

### How it works
`services/scam_rules.py` is a **deliberately rule-based classifier** — that is the product
feature, not a compromise. Neural verdicts are opaque; a rule engine's verdict decomposes
into evidence a court can audit.

- The knowledge base `data/scam_rules.json` defines **6 threat categories**, each with
  compiled regex patterns:
  1. Authority impersonation (CBI, ED, TRAI, RBI, cyber cell, officer ranks, FIR/warrant claims)
  2. Coercion & urgency ("digital arrest", deadlines, jail threats, camera-on demands)
  3. Financial extraction (transfer demands, "safe account", UPI/NEFT/crypto channels)
  4. Secrecy & isolation ("don't tell anyone", "go to a private room")
  5. Personal-data harvesting (Aadhaar/PAN, OTP/CVV/PIN demands)
  6. Malicious link / app lure (AnyDesk/TeamViewer, shortened URLs)
- **Scoring:** each matching category contributes `base_weight` + `per_extra_match` per
  additional rule, capped per category; the total is capped at 0.99. Fully deterministic —
  the same input always yields the same score.
- **The response is the audit trail:** every matched span with character offsets
  (`evidence`), per-category percentage contributions with matched terms
  (`contributions`), human-readable indicators, and a compound category label
  (e.g. authority + coercion ⇒ "Digital Arrest Scam").

### What you see
Risk score, a rubber-stamp verdict (SCAM DETECTED / SUSPICIOUS / NO THREAT DETECTED),
audit indicator cards, and contribution bars that always sum to 100% with the exact
matched terms under each. The control call correctly scores 0.0.

**Example:** the CBI script reaches 99% — Authority impersonation 32%, Coercion & urgency
32%, Financial extraction 20%, Personal-data harvesting 16%.

---

## 4. Module M2 — Counterfeit Note Scanner

### What it is
Drag-and-drop (or browse) a photo of an Indian currency note; a genuinely trained
computer-vision model returns GENUINE or COUNTERFEIT with both class probabilities and
full model provenance.

### How the model was trained (`ml/m2_train.py`)
- **Architecture:** MobileNetV3-Small with ImageNet weights; backbone frozen, classifier
  head fine-tuned (small-data-friendly transfer learning).
- **Dataset:** public "Fake Currency Checker" dataset of real/fake Indian notes —
  150 train / 60 validation / 107 test images.
- **Training:** 8 epochs, AdamW, cosine LR schedule, augmentation (flip, color jitter,
  rotation), best-validation checkpoint kept. Seeded (42) for reproducibility.
- **Measured held-out results:**

| Metric | Value |
|---|---|
| Test accuracy | **88.8%** |
| Precision (fake) | **0.927** |
| Recall (fake) | **0.864** |
| F1 (fake) | **0.895** |
| Confusion matrix | TP 51 · FP 4 · FN 8 · TN 44 |

- **Export:** `counterfeit_mnv3.onnx` (6.1 MB) + `counterfeit_meta.json` carrying
  preprocessing spec, class order, dataset description, timestamp, and the metrics above.

### How inference works (`services/counterfeit.py`)
The backend loads the ONNX model at startup (CPU execution provider). Uploads are
preprocessed exactly as in training (224×224 bilinear resize, ImageNet normalization),
run through the session, and softmaxed. The serving path was verified to reproduce the
training confusion matrix exactly on the full test split — no train/serve skew.
If the model file is absent the endpoint returns **503**, never a fabricated verdict.

### What you see
A scan animation during inference, a stamped verdict with model confidence, both class
probability bars, and a **Model Provenance** card showing the model, training date,
dataset, and held-out accuracy — every verdict ships with its full pedigree.

---

## 5. Module M3 — Fraud Network Graph (GNN)

### What it is
An interactive SVG visualization of a money-mule network: red nodes are model-flagged
mule accounts, blue are normal accounts; clicking a node opens its transaction telemetry
and the model's audit trail. A provenance overlay shows the training run's real metrics.

### How the model was trained (`ml/m3_graph_train.py`)
1. **Synthetic PaySim-schema ledger:** 400 accounts, 2,668
   transactions of organic background activity, plus **5 injected mule rings** (8 accounts
   each) exhibiting the classic laundering topology — victim fan-in to collectors,
   circular layering chain, cash-out fan-out.
2. **Features per account:** log in/out volume, transaction counts, degree, mean/std
   amount, in/out flow ratio — standardized.
3. **Model:** 2-layer GraphSAGE with mean aggregation, implemented in plain PyTorch over a
   row-normalized adjacency (no torch-geometric dependency). Class-weighted cross-entropy
   (mules ≈ 10% of nodes), 200 epochs, 70/30 node split.
4. **Measured test results:** AUC **1.0**, precision **0.909**, recall **1.0**, F1
   **0.952** on held-out nodes — the model cleanly recovers every injected laundering
   ring from transaction features and graph structure alone.
5. **Export:** the 80-node neighborhood around the highest-risk predictions with
   `networkx` spring-layout coordinates baked in, per-node mule probability as
   `riskScore`, plausible Indian account metadata, and a `meta` block (model, data
   description, metrics, epochs, seed, timestamp).

### How serving works (`services/graph_service.py`)
The backend serves the artifact verbatim (cached). No synthetic fallback exists — missing
artifact ⇒ 503 with retraining instructions.

---

## 6. Module M4 — Citizen Fraud Shield (multilingual chatbot)

### What it is
A WhatsApp-style chat where a citizen forwards a suspicious message and receives a risk
verdict **in their language** — English, हिंदी, ಕನ್ನಡ, தமிழ், తెలుగు — with the helpline
(1930) and reporting portals. Four one-tap sample threats are provided.

### How it works (`services/shield_bot.py`) — a real RAG pipeline
1. **Retrieval:** a hand-rolled TF-IDF cosine-similarity index (no extra dependencies)
   over `data/advisories.json` — **14 curated advisories** paraphrased from public
   RBI / I4C / TRAI / NPCI awareness campaigns (digital arrest, KYC phishing, courier
   customs, loan-app harassment, sextortion, UPI reversal, investment fraud, etc.).
   Top-3 matches become the model's context.
2. **Generation:** Gemini (JSON mode) classifies risk level and scam type and writes the
   verdict twice — English plus the requested language natively. The prompt explicitly
   instructs restraint: ordinary messages must come back Safe/Low (the false-positive
   rate matters more for a citizen tool than catch rate).
3. **Resilience:** a model fallback chain (`gemini-flash-latest` → `gemini-2.0-flash` →
   `gemini-flash-lite-latest`) with a 15-second HTTP timeout. If every model fails — or no
   `GEMINI_API_KEY` is configured — a deterministic keyword fallback answers from the same
   advisory base (English/Hindi).
4. **Honesty:** every reply carries an `engine` tag (`gemini` or `rules`) rendered as a
   badge in the chat, plus the list of matched advisories.

---

## 7. Command Center

### National Threat Heatmap
- `data/hotspots.json` curates **25 publicly reported fraud-hub districts** (Jamtara,
  Nuh/Mewat, Bharatpur, Deoghar, metros…) with 0–1 intensity weights and their known
  scam typologies, compiled from NCRB and press reporting.
- `services/alerts.py` generates a deterministic cloud of **208 heat points** (seeded
  Gaussian jitter around each hub, scaled by intensity) rendered through `leaflet.heat`
  on a dark CARTO basemap, plus clickable intercept markers.

### Intercept Alert Feed
Polled every 6 seconds: five hubs sampled per poll, each paired with a representative
transcript snippet of its dominant scam type and a risk score derived from hub intensity.
Telemetry cards show real counts from the knowledge base (25 districts monitored,
9 critical, 14 scam typologies).

### Header status pill
Polls `/api/health` every 10 seconds; shows BACKEND LIVE/OFFLINE and, on hover, the true
model/Gemini/graph state.

---

## 8. Evidence Export ("Intelligence Package")

**The differentiator for legal admissibility.** Every module records its latest verdict
into a session store (`src/resultsStore.js`). The Evidence Package button (Command Center)
opens a modal where the analyst names the case and generates a package.

`services/evidence.py` builds:
- `package_id` (e.g. `KVC-20260722-a1b2c3`), UTC timestamp, platform version
- the captured module artifacts exactly as rendered on screen
- a chain-of-custody log
- an **integrity block**: SHA-256 computed over the canonical JSON (sorted keys, compact
  separators, UTF-8) of everything above it

Anyone can independently re-verify the hash; changing a single character breaks it. The
package downloads as JSON, named after its ID.

---

## 9. API Reference

Base URL: `http://localhost:8000` (deployed: set `VITE_API_URL` in the frontend env).

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/health` | True runtime capability state | drives the UI status pill |
| POST | `/api/scam-detect` | `{text, threshold?}` → score, verdict, evidence spans, contributions | deterministic |
| POST | `/api/counterfeit-check` | multipart image → verdict, probabilities, provenance | 503 if model absent |
| GET | `/api/fraud-network` | GraphSAGE artifact: nodes, links, meta | 503 if artifact absent |
| POST | `/api/whatsapp-simulate` | `{message, language}` → verdict EN + local, engine tag | Gemini or rules |
| GET | `/api/alerts` | heat points, alert feed, stats | feed rotates per poll |
| POST | `/api/evidence-export` | `{case_title, analyst, artifacts}` → hash-stamped package | SHA-256 integrity |

Interactive docs: `http://localhost:8000/docs` (FastAPI/Swagger).

---

## 10. Design System — "The Evidence Room"

The UI encodes the product thesis. Indian fraud casework lives in a specific material
world — typewritten FIRs, manila case files, violet stamp-pad ink, khaki uniforms — and
the interface is built from it:

- **Two worlds:** a dark khaki ops-room shell for live surfaces (map, feeds, transcripts,
  graph) containing **manila paper document panels** for anything that is a finding.
  Surveillance happens in the dark; conclusions go on paper.
- **Signature element — rubber-stamp verdicts:** SCAM DETECTED / GENUINE / COUNTERFEIT
  land as rotated double-border stamps in lac-seal red or passport green, with a
  stamp-thunk entrance animation and a typewriter sub-line carrying provenance.
- **Exhibit tags:** each paper panel has a file tab (`EXHIBIT M1 · CALL INTERCEPT
  ANALYSIS`) — honest structure, since these panels are literally what the evidence
  export bundles.
- **Nav as file-folder tabs:** the active module is the open file — its tab turns manila.
- **Type:** Archivo (display/UI) + **Courier Prime** for everything evidentiary — labels,
  intercept snippets, hashes. The typewriter voice is the case-file vernacular.
- **Palette:** olive-black shell `#191c15`, manila `#ece3c8`, stamp-ink violet primary,
  lac red, passport green. (No cyan; no glassmorphism.)
- **Implementation trick:** paper panels re-scope the CSS custom properties
  (`.doc-panel { --accent-red: #a8322a; … }`) so every inline `var()` style inside
  retunes automatically — one class flips a panel between worlds.
- **Floor:** responsive to mobile, `prefers-reduced-motion` respected, visible keyboard
  focus rings.

---

## 11. Repository Layout

```
kavach/
├── backend/
│   ├── requirements.txt
│   ├── .env.example              # GEMINI_API_KEY template (real .env is gitignored)
│   └── app/
│       ├── main.py               # FastAPI app, CORS, dotenv, router mount
│       ├── schemas.py            # Pydantic request/response models
│       ├── routers/api.py        # all endpoints
│       ├── services/             # the six engines (see §2)
│       ├── data/                 # scam_rules.json · hotspots.json · advisories.json
│       └── resources/            # counterfeit_mnv3.onnx · counterfeit_meta.json ·
│                                 # fraud_network_data.json  (committed on purpose)
├── frontend/
│   ├── package.json              # React 19, Vite 6, Leaflet, leaflet.heat, lucide
│   ├── .env.example              # VITE_API_URL template
│   └── src/
│       ├── App.jsx               # tab shell + health poll
│       ├── App.css               # the entire design system
│       ├── api.js                # API base + fetch helpers
│       ├── resultsStore.js       # session verdicts for evidence export
│       └── components/           # CommandCenter · ScamDetector · CounterfeitNote ·
│                                 # FraudGraph · WhatsAppShield · EvidenceExport ·
│                                 # HeatmapLayer
└── ml/
    ├── requirements.txt          # torch (CPU), torchvision, networkx, …
    ├── m2_train.py               # M2 training → ONNX + metrics
    ├── m3_graph_train.py         # M3 training → graph artifact
    └── datasets/README.md        # dataset download instructions
```

---

## 12. Running the Project

**Backend** (Python 3.11+):
```bash
cd backend
python -m venv .venv && .venv/Scripts/activate      # source .venv/bin/activate on Unix
pip install -r requirements.txt
cp .env.example .env                                # add GEMINI_API_KEY (optional)
uvicorn app.main:app --reload --port 8000
```

**Frontend** (Node 20+):
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

**Retraining** (optional — artifacts are committed):
```bash
python -m venv ml/.venv && ml/.venv/Scripts/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r ml/requirements.txt
python ml/m2_train.py        # needs dataset, see ml/datasets/README.md (~5-10 min CPU)
python ml/m3_graph_train.py  # self-contained (~1 min CPU)
```

**Deploying (Vercel — how the live demo runs):** the repo deploys as a single Vercel
project. `vercel.json` builds the Vite frontend to static output and serves the FastAPI
app as a Python 3.12 serverless function from `api/index.py`, with `backend/**` (models
and knowledge bases) bundled via `includeFiles`. A rewrite sends `/api/*` to the function,
so the API shares the frontend's origin — no CORS, and no API URL to configure.
`GEMINI_API_KEY` is set as a Vercel environment variable.

```bash
vercel link
vercel env add GEMINI_API_KEY production
vercel deploy --prod
```

For a split deployment (backend hosted elsewhere), set `VITE_API_URL` to the backend
origin at build time; it overrides the same-origin default.

---

## 13. Roadmap

- **M1** — expand the rule packs to Hinglish and regional-language call patterns, and add
  a classifier stage alongside the auditable rule core.
- **M2** — scale training to larger note datasets across denominations and field
  conditions; on-device TFLite export for offline village deployment.
- **M3** — connect the GraphSAGE pipeline to live NPCI/bank transaction feeds; the
  feature extraction and model are ledger-schema-ready today.
- **M4** — extend beyond the current five languages toward full regional coverage, with
  richer advisory retrieval.
- **Command Center** — ingest live complaint telemetry (1930 helpline / Chakshu portal
  feeds) into the hotspot heatmap; analyst accounts with role-based access.
