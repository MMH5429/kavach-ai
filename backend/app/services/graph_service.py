"""M3 — Fraud network graph, served from a real training run's output.

fraud_network_data.json is produced by ml/m3_graph_train.py: a GraphSAGE model
trained on a simulated PaySim-schema transaction ledger. Node riskScore is the
model's predicted mule probability; layout coordinates are baked in from
networkx spring_layout at training time. The meta block carries training
provenance (AUC, F1, epochs, trained_at) and is displayed in the UI.

No synthetic fallback: if the artifact is absent, the endpoint returns 503.
"""
import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "resources" / "fraud_network_data.json"


class GraphService:
    def __init__(self) -> None:
        self._cache = None

    @property
    def available(self) -> bool:
        return DATA_PATH.exists()

    def get_network(self) -> dict:
        if self._cache is None:
            self._cache = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        return self._cache

    def meta_summary(self) -> dict:
        if not self.available:
            return {"present": False}
        meta = self.get_network().get("meta", {})
        return {"present": True, "trained_at": meta.get("trained_at"), "auc": meta.get("auc")}


service = GraphService()
