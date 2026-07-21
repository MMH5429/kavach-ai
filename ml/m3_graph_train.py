"""M3 — Train a GraphSAGE mule-account classifier and export the demo graph.

Pipeline (all real, all reproducible, honestly labeled as simulated data):
 1. Generate a PaySim-schema transaction ledger: ~400 accounts, organic
    random transfers, plus injected mule rings that exhibit the classic
    fan-in -> layering -> fan-out laundering topology.
 2. Build the account graph and per-node features (txn volume stats, degree,
    in/out ratio, burstiness).
 3. Train a 2-layer GraphSAGE (mean aggregator, implemented in plain PyTorch
    on the dense adjacency — no torch-geometric dependency) with a train/test
    node split.
 4. Export backend/app/resources/fraud_network_data.json: an 80-node
    neighborhood around the highest-risk predictions, with spring-layout
    coordinates baked in, model probabilities as riskScore, and training
    provenance (AUC/F1, timestamp) in `meta`.

Run:  ml/.venv/Scripts/python.exe ml/m3_graph_train.py   (~1 min CPU)
"""
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx
import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT.parent / "backend" / "app" / "resources" / "fraud_network_data.json"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

SEED = 42
N_ACCOUNTS = 400
N_RINGS = 5
RING_SIZE = 8

FIRST = ["Aarav", "Vivaan", "Aditya", "Ananya", "Diya", "Ishaan", "Kavya", "Rohan",
         "Priya", "Arjun", "Sneha", "Kiran", "Manish", "Pooja", "Rahul", "Nisha",
         "Vikram", "Anjali", "Suresh", "Meera", "Amit", "Divya", "Rajesh", "Swati"]
LAST = ["Sharma", "Verma", "Patel", "Reddy", "Nair", "Singh", "Das", "Kulkarni",
        "Mehta", "Joshi", "Gupta", "Yadav", "Chauhan", "Mishra", "Rao", "Iyer"]
BANKS = ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "PNB", "Kotak Mahindra",
         "Canara Bank", "Bank of Baroda", "IndusInd", "Union Bank"]
CITIES = ["Jamtara", "Nuh (Mewat)", "Bharatpur", "Alwar", "Deoghar", "Mumbai",
          "Delhi", "Bengaluru", "Hyderabad", "Pune", "Kolkata", "Lucknow"]
MULE_CITIES = ["Jamtara", "Nuh (Mewat)", "Bharatpur", "Alwar", "Deoghar"]


def simulate_ledger(rng: random.Random):
    """Return (transactions, mule_ids). PaySim-like rows: (src, dst, amount)."""
    txns = []
    mule_ids = set()

    # Organic background activity.
    for _ in range(N_ACCOUNTS * 6):
        a, b = rng.sample(range(N_ACCOUNTS), 2)
        txns.append((a, b, rng.lognormvariate(8.2, 1.0)))  # median ~ Rs 3.6k

    # Injected mule rings: victims fan-in to collectors, layering chain, fan-out.
    next_id = 0
    for _ in range(N_RINGS):
        ring = list(range(next_id, next_id + RING_SIZE))
        next_id += RING_SIZE
        mule_ids.update(ring)
        collectors, layers = ring[:3], ring[3:]
        for c in collectors:  # many victims send similar mid-size amounts
            for _ in range(rng.randint(8, 14)):
                victim = rng.randrange(RING_SIZE * N_RINGS, N_ACCOUNTS)
                txns.append((victim, c, rng.uniform(15000, 49000)))
        for c in collectors:  # collectors push into the layering chain
            for l in layers:
                if rng.random() < 0.8:
                    txns.append((c, l, rng.uniform(40000, 95000)))
        for i, l in enumerate(layers):  # circular layering + fan-out
            txns.append((l, layers[(i + 1) % len(layers)], rng.uniform(30000, 90000)))
            if rng.random() < 0.6:
                cashout = rng.randrange(RING_SIZE * N_RINGS, N_ACCOUNTS)
                txns.append((l, cashout, rng.uniform(20000, 60000)))
    return txns, mule_ids


def build_features(txns, n):
    """Per-account features from the ledger + graph."""
    out_amt = np.zeros(n); in_amt = np.zeros(n)
    out_cnt = np.zeros(n); in_cnt = np.zeros(n)
    amounts = [[] for _ in range(n)]
    G = nx.Graph()
    G.add_nodes_from(range(n))
    for s, d, amt in txns:
        out_amt[s] += amt; in_amt[d] += amt
        out_cnt[s] += 1; in_cnt[d] += 1
        amounts[s].append(amt); amounts[d].append(amt)
        G.add_edge(s, d)
    deg = np.array([G.degree(i) for i in range(n)], dtype=float)
    mean_amt = np.array([np.mean(a) if a else 0 for a in amounts])
    std_amt = np.array([np.std(a) if len(a) > 1 else 0 for a in amounts])
    flow_ratio = (in_amt + 1) / (out_amt + 1)
    X = np.stack([
        np.log1p(in_amt), np.log1p(out_amt), in_cnt, out_cnt, deg,
        np.log1p(mean_amt), np.log1p(std_amt), np.log(flow_ratio),
    ], axis=1)
    X = (X - X.mean(0)) / (X.std(0) + 1e-8)
    return X.astype(np.float32), G


class GraphSAGE(nn.Module):
    """2-layer mean-aggregator GraphSAGE on a dense normalized adjacency."""

    def __init__(self, in_dim, hidden=32):
        super().__init__()
        self.w_self1 = nn.Linear(in_dim, hidden)
        self.w_neigh1 = nn.Linear(in_dim, hidden)
        self.w_self2 = nn.Linear(hidden, hidden)
        self.w_neigh2 = nn.Linear(hidden, hidden)
        self.head = nn.Linear(hidden, 2)

    def forward(self, x, adj):  # adj: row-normalized (mean aggregation)
        h = torch.relu(self.w_self1(x) + self.w_neigh1(adj @ x))
        h = torch.relu(self.w_self2(h) + self.w_neigh2(adj @ h))
        return self.head(h)


def auc_score(y_true, scores):
    order = np.argsort(scores)
    ranks = np.empty(len(scores)); ranks[order] = np.arange(1, len(scores) + 1)
    pos = y_true == 1
    n_pos, n_neg = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def main():
    rng = random.Random(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    txns, mule_ids = simulate_ledger(rng)
    X, G = build_features(txns, N_ACCOUNTS)
    y = np.array([1 if i in mule_ids else 0 for i in range(N_ACCOUNTS)])
    print(f"ledger: {len(txns)} txns, {N_ACCOUNTS} accounts, {int(y.sum())} mules, {G.number_of_edges()} edges")

    # Row-normalized adjacency with self-loops for mean aggregation.
    A = nx.to_numpy_array(G) + np.eye(N_ACCOUNTS)
    adj = torch.tensor(A / A.sum(1, keepdims=True), dtype=torch.float32)
    Xt = torch.tensor(X); yt = torch.tensor(y, dtype=torch.long)

    idx = np.arange(N_ACCOUNTS)
    np.random.shuffle(idx)
    split = int(0.7 * N_ACCOUNTS)
    train_idx, test_idx = torch.tensor(idx[:split]), torch.tensor(idx[split:])

    model = GraphSAGE(X.shape[1])
    opt = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)
    # class-weighted loss (mules are ~10% of nodes)
    w = torch.tensor([1.0, (len(y) - y.sum()) / max(y.sum(), 1)], dtype=torch.float32)
    loss_fn = nn.CrossEntropyLoss(weight=w)

    for epoch in range(200):
        model.train(); opt.zero_grad()
        out = model(Xt, adj)
        loss = loss_fn(out[train_idx], yt[train_idx])
        loss.backward(); opt.step()
        if (epoch + 1) % 50 == 0:
            print(f"epoch {epoch+1} loss={loss.item():.4f}")

    model.eval()
    with torch.no_grad():
        probs = torch.softmax(model(Xt, adj), dim=1)[:, 1].numpy()
    test_pred = (probs[test_idx.numpy()] > 0.5).astype(int)
    test_y = y[test_idx.numpy()]
    tp = int(((test_pred == 1) & (test_y == 1)).sum()); fp = int(((test_pred == 1) & (test_y == 0)).sum())
    fn = int(((test_pred == 0) & (test_y == 1)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    auc = auc_score(test_y, probs[test_idx.numpy()])
    print(f"TEST: auc={auc:.3f} precision={prec:.3f} recall={rec:.3f} f1={f1:.3f}")

    # ---- export a demo neighborhood: all mules + linked normals, capped at 80 ----
    flagged = [i for i in range(N_ACCOUNTS) if probs[i] > 0.5]
    keep = set(flagged)
    for i in flagged:
        keep.update(list(G.neighbors(i))[:4])
    keep = sorted(keep, key=lambda i: -probs[i])[:80]
    sub = G.subgraph(keep)
    pos = nx.spring_layout(sub, seed=SEED, k=0.9)
    xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]

    def to_canvas(p):
        x = 40 + (p[0] - min(xs)) / (max(xs) - min(xs) + 1e-9) * 520
        y = 40 + (p[1] - min(ys)) / (max(ys) - min(ys) + 1e-9) * 360
        return round(x, 1), round(y, 1)

    node_rng = random.Random(SEED + 1)
    nodes = []
    for i in keep:
        cx, cy = to_canvas(pos[i])
        is_mule = bool(probs[i] > 0.5)
        nodes.append({
            "id": str(i),
            "name": f"{node_rng.choice(FIRST)} {node_rng.choice(LAST)}",
            "bank": node_rng.choice(BANKS),
            "city": node_rng.choice(MULE_CITIES if is_mule else CITIES),
            "isMule": is_mule,
            "riskScore": round(float(probs[i]) * 100, 1),
            "avgTxn": int(np.mean([a for s, d, a in txns if s == i or d == i]) if any(s == i or d == i for s, d, a in txns) else 0),
            "frequency": int(sum(1 for s, d, _ in txns if s == i or d == i)),
            "degree": int(G.degree(i)),
            "x": cx, "y": cy,
        })
    links = [{"source": str(u), "target": str(v)} for u, v in sub.edges()]

    payload = {
        "nodes": nodes,
        "links": links,
        "meta": {
            "model": "GraphSAGE (2-layer, mean aggregator)",
            "data": f"simulated PaySim-schema ledger — {len(txns)} transactions, {N_ACCOUNTS} accounts, {N_RINGS} injected mule rings",
            "auc": round(auc, 3),
            "f1": round(f1, 3),
            "precision": round(prec, 3),
            "recall": round(rec, 3),
            "epochs": 200,
            "seed": SEED,
            "n_nodes": len(nodes),
            "n_edges": len(links),
            "trained_at": datetime.now(timezone.utc).isoformat(),
            "note": "Methodology demonstration on simulated data; production deployment would ingest real NPCI/bank ledgers.",
        },
    }
    OUT_PATH.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"saved {OUT_PATH} ({len(nodes)} nodes, {len(links)} links)")


if __name__ == "__main__":
    main()
