"""Command-center feed: hotspot heatmap points, rotating alert feed, stats.

Data source: data/hotspots.json — a curated list of publicly reported fraud-hub
districts. Heat points are jittered around each hub scaled by intensity; the
alert feed rotates through hubs with representative transcript snippets.
Clearly labeled demo telemetry, driven by the curated knowledge base (not
fabricated model metrics).
"""
import json
import random
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "hotspots.json"


class AlertService:
    def __init__(self) -> None:
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        self.hotspots = data["hotspots"]
        self.snippets = {s["type"]: s["text"] for s in data["transcript_snippets"]}
        # Deterministic heat cloud per process start (stable across polls).
        rng = random.Random(7)
        self.heat_points = []
        for h in self.hotspots:
            n_points = max(3, int(h["intensity"] * 12))
            for _ in range(n_points):
                self.heat_points.append([
                    round(h["lat"] + rng.gauss(0, 0.35), 4),
                    round(h["lng"] + rng.gauss(0, 0.35), 4),
                    round(h["intensity"] * rng.uniform(0.6, 1.0), 3),
                ])

    def get_feed(self) -> dict:
        rng = random.Random()  # feed rotates each poll — presentation only
        chosen = rng.sample(self.hotspots, 5)
        alerts = []
        for i, h in enumerate(chosen):
            scam_type = rng.choice(h["types"])
            snippet = self.snippets.get(scam_type, "Suspicious activity pattern flagged for review.")
            alerts.append({
                "id": f"ALT-{datetime.now(timezone.utc).strftime('%H%M')}-{i}",
                "city": h["city"],
                "coordinates": [h["lat"], h["lng"]],
                "details": scam_type.replace("_", " ").title(),
                "risk_score": round(55 + h["intensity"] * 43),
                "snippet": snippet,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        critical = sum(1 for h in self.hotspots if h["intensity"] >= 0.8)
        return {
            "alerts": alerts,
            "heat_points": self.heat_points,
            "stats": {
                "active_hotspots": len(self.hotspots),
                "critical_hotspots": critical,
                "monitored_scam_types": len({t for h in self.hotspots for t in h["types"]}),
                "heat_points": len(self.heat_points),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }


service = AlertService()
