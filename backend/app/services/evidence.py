"""Evidence export — court-admissibility-oriented intelligence packages.

Builds a timestamped JSON package containing the module verdicts the analyst
currently has on screen, a chain-of-custody log, and a SHA-256 integrity hash
computed over the canonical (sorted-key, compact) JSON of everything above it.
Anyone can independently re-verify the hash; altering a single character of
the package breaks it.
"""
import hashlib
import json
import secrets
from datetime import datetime, timezone


def build_package(case_title: str, analyst: str, artifacts: dict) -> dict:
    now = datetime.now(timezone.utc)
    package_id = f"KVC-{now.strftime('%Y%m%d')}-{secrets.token_hex(3)}"

    body = {
        "package_id": package_id,
        "generated_at": now.isoformat(),
        "platform": "Kavach AI v1.0",
        "case": {"title": case_title, "analyst": analyst},
        "artifacts": artifacts,
        "chain_of_custody": [
            {
                "ts": now.isoformat(),
                "action": "package_created",
                "actor": "kavach-backend",
                "detail": f"Evidence package assembled from {len(artifacts)} module artifact(s).",
            }
        ],
    }

    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    body["integrity"] = {
        "algorithm": "SHA-256",
        "hash": digest,
        "note": "Hash computed over the canonical JSON (sorted keys, compact separators, UTF-8) of all fields above 'integrity'.",
    }
    return body
