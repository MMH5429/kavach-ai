"""M1 — Explainable scam-detection rule engine.

Deliberately rule-based, not a neural black box: every verdict decomposes into
matched evidence spans (with character offsets) and per-rule score
contributions. That decomposition is the product feature — an audit trail
suitable for legal-admissibility requirements, which opaque neural verdicts
cannot provide.

Scoring: each category contributes base_weight for its first matching rule,
plus per_extra_match for each additional matching rule, capped at the
category's cap. The total is capped at 0.99. Fully deterministic.
"""
import json
import re
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "scam_rules.json"


class ScamRuleEngine:
    def __init__(self) -> None:
        config = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        self.categories = config["categories"]
        self.category_names = config["category_names"]
        # Pre-compile all regexes once.
        for cat in self.categories:
            for pat in cat["patterns"]:
                pat["compiled"] = re.compile(pat["regex"], re.IGNORECASE)

    def analyze(self, text: str, threshold: float = 60.0) -> dict:
        evidence = []          # matched spans with offsets
        cat_results = []       # per-category scoring detail

        for cat in self.categories:
            matched_rules = []
            for pat in cat["patterns"]:
                terms = []
                for m in pat["compiled"].finditer(text):
                    terms.append(m.group(0))
                    evidence.append({
                        "span": m.group(0),
                        "start": m.start(),
                        "end": m.end(),
                        "category": cat["id"],
                        "rule": pat["rule"],
                    })
                if terms:
                    matched_rules.append({"rule": pat["rule"], "terms": terms})

            if matched_rules:
                raw = cat["base_weight"] + cat["per_extra_match"] * (len(matched_rules) - 1)
                score = min(raw, cat["cap"])
                cat_results.append({
                    "id": cat["id"],
                    "label": cat["label"],
                    "category_name": cat["category_name"],
                    "score": score,
                    "matched_rules": matched_rules,
                })

        raw_total = sum(c["score"] for c in cat_results)
        total = min(raw_total, 0.99)
        risk_score = round(total * 100, 1)
        is_scam = risk_score > threshold

        # Per-category contribution as % of the total score — this is the real
        # explainability payload the UI renders (replacing fake SHAP numbers).
        contributions = []
        for c in sorted(cat_results, key=lambda x: -x["score"]):
            terms = sorted({t.lower() for r in c["matched_rules"] for t in r["terms"]})
            contributions.append({
                "rule": c["id"],
                "label": c["label"],
                "matched_terms": terms,
                "weight_pct": round(100 * c["score"] / raw_total, 1) if raw_total else 0.0,
            })

        indicators = [
            f"{c['label']}: {', '.join(sorted({t.lower() for r in c['matched_rules'] for t in r['terms']})[:4])}"
            for c in sorted(cat_results, key=lambda x: -x["score"])
        ]

        return {
            "risk_score": risk_score,
            "verdict": "SCAM DETECTED" if is_scam else ("SUSPICIOUS" if risk_score > threshold / 2 else "NO THREAT DETECTED"),
            "is_scam": is_scam,
            "category": self._resolve_category(cat_results, is_scam),
            "indicators": indicators,
            "threshold": threshold,
            "evidence": evidence,
            "contributions": contributions,
        }

    def _resolve_category(self, cat_results: list[dict], is_scam: bool) -> str:
        if not cat_results:
            return self.category_names["default_clean"]
        matched_ids = {c["id"] for c in cat_results}
        if {"authority_impersonation", "coercion_urgency"} <= matched_ids:
            return self.category_names["authority_impersonation+coercion_urgency"]
        if {"authority_impersonation", "financial_extraction"} <= matched_ids:
            return self.category_names["authority_impersonation+financial_extraction"]
        if is_scam or cat_results:
            top = max(cat_results, key=lambda c: c["score"])
            return top["category_name"] if is_scam else self.category_names["default_scam"] if len(cat_results) > 1 else top["category_name"]
        return self.category_names["default_clean"]


engine = ScamRuleEngine()
