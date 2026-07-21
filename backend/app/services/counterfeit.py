"""M2 — Counterfeit currency detection via a genuinely trained ONNX model.

Loads counterfeit_mnv3.onnx (MobileNetV3-Small fine-tuned locally by
ml/m2_train.py) plus counterfeit_meta.json describing preprocessing, class
order, dataset provenance, and held-out eval metrics.

If the model artifact is missing, the endpoint returns 503 — this service
never fabricates a verdict.
"""
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image

RESOURCES = Path(__file__).resolve().parent.parent / "resources"
MODEL_PATH = RESOURCES / "counterfeit_mnv3.onnx"
META_PATH = RESOURCES / "counterfeit_meta.json"


class CounterfeitService:
    def __init__(self) -> None:
        self.session = None
        self.meta = None
        if MODEL_PATH.exists() and META_PATH.exists():
            import onnxruntime as ort

            self.session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
            self.meta = json.loads(META_PATH.read_text(encoding="utf-8"))
            self.input_name = self.session.get_inputs()[0].name

    @property
    def available(self) -> bool:
        return self.session is not None

    def _preprocess(self, image_bytes: bytes) -> np.ndarray:
        size = self.meta["input_size"]
        mean = np.array(self.meta["normalize_mean"], dtype=np.float32)
        std = np.array(self.meta["normalize_std"], dtype=np.float32)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((size, size), Image.BILINEAR)
        arr = np.asarray(img, dtype=np.float32) / 255.0
        arr = (arr - mean) / std
        return arr.transpose(2, 0, 1)[None, ...]  # NCHW

    def predict(self, image_bytes: bytes) -> dict:
        if not self.available:
            raise RuntimeError("Model not available")
        x = self._preprocess(image_bytes)
        logits = self.session.run(None, {self.input_name: x})[0][0]
        exp = np.exp(logits - logits.max())
        probs = exp / exp.sum()
        classes = self.meta["classes"]  # e.g. ["fake", "real"]
        p = {c: float(probs[i]) for i, c in enumerate(classes)}
        is_genuine = p["real"] >= p["fake"]
        confidence = round(100 * max(p.values()), 1)
        return {
            "verdict": "GENUINE" if is_genuine else "COUNTERFEIT",
            "is_genuine": is_genuine,
            "confidence": confidence,
            "probabilities": {"genuine": round(p["real"], 4), "counterfeit": round(p["fake"], 4)},
            "model": {
                "name": self.meta["model_name"],
                "input_size": self.meta["input_size"],
                "trained_at": self.meta["trained_at"],
                "dataset": self.meta["dataset"],
                "test_accuracy": self.meta.get("metrics", {}).get("test_accuracy"),
            },
        }


service = CounterfeitService()
