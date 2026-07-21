"""M4 — Citizen Fraud Shield (multilingual, Gemini + local advisory retrieval).

Pipeline: TF-IDF cosine retrieval over a curated advisory knowledge base
(data/advisories.json) selects the top-3 relevant advisories; Gemini 2.5 Flash
(JSON mode) produces a verdict in English plus the requested regional
language. Every response carries `engine` ("gemini" | "rules") so the UI is
honest about which path answered. Without a GEMINI_API_KEY the deterministic
keyword fallback runs (English + Hindi only).
"""
import json
import math
import os
import re
from collections import Counter
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "advisories.json"

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
}

_WORD_RE = re.compile(r"[a-z]{3,}")
_STOP = {
    "the", "and", "for", "you", "your", "are", "not", "with", "this", "that",
    "have", "has", "will", "can", "any", "all", "our", "from", "please",
}


def _tokens(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall(text.lower()) if w not in _STOP]


class ShieldBot:
    def __init__(self) -> None:
        data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        self.advisories = data["advisories"]
        self._build_index()

        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.client = None
        if self.api_key:
            try:
                from google import genai

                self.client = genai.Client(api_key=self.api_key)
            except Exception:
                self.client = None

    # ---- hand-rolled TF-IDF retrieval (no extra deps) ----
    def _build_index(self) -> None:
        docs = [_tokens(a["topic"] + " " + a["rules"]) for a in self.advisories]
        n = len(docs)
        df = Counter(term for doc in docs for term in set(doc))
        self.idf = {t: math.log(n / c) + 1.0 for t, c in df.items()}
        self.doc_vecs = []
        for doc in docs:
            tf = Counter(doc)
            vec = {t: (c / len(doc)) * self.idf[t] for t, c in tf.items()}
            norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
            self.doc_vecs.append({t: v / norm for t, v in vec.items()})

    def retrieve(self, message: str, k: int = 3) -> list[dict]:
        q = _tokens(message)
        if not q:
            return []
        tf = Counter(q)
        qvec = {t: (c / len(q)) * self.idf.get(t, 0.0) for t, c in tf.items()}
        qnorm = math.sqrt(sum(v * v for v in qvec.values())) or 1.0
        scored = []
        for adv, dvec in zip(self.advisories, self.doc_vecs):
            sim = sum(qvec[t] / qnorm * dvec.get(t, 0.0) for t in qvec)
            if sim > 0.02:
                scored.append((sim, adv))
        scored.sort(key=lambda s: -s[0])
        return [adv for _, adv in scored[:k]]

    # ---- main entry ----
    def analyze(self, message: str, language: str = "en") -> dict:
        matched = self.retrieve(message)
        if self.client:
            try:
                return self._gemini_verdict(message, language, matched)
            except Exception:
                pass  # fall through to rules
        return self._rules_verdict(message, language, matched)

    def _gemini_verdict(self, message: str, language: str, matched: list[dict]) -> dict:
        from google.genai import types

        context = "\n\n".join(
            f"[{a['topic']}] (risk: {a['risk']})\n{a['rules']}" for a in matched
        ) or "No specific advisory matched; use general anti-fraud judgment."
        lang_name = LANGUAGE_NAMES.get(language, "English")

        prompt = f"""You are Kavach, an Indian public-safety fraud analyst bot.
A citizen forwarded this message/call summary:

---
{message}
---

Official advisory context:
{context}

Classify it. Respond ONLY with JSON:
{{
  "risk_level": "Critical" | "High" | "Medium" | "Low" | "Safe",
  "scam_type": short label, e.g. "Digital Arrest Scam" or "Legitimate Message",
  "verdict_en": 2-3 sentence plain-English verdict with concrete advice (mention helpline 1930 / cybercrime.gov.in when relevant),
  "verdict_local": the same verdict written natively in {lang_name}
}}
If the language requested is English, verdict_local must equal verdict_en.
Be measured: ordinary promotions/personal messages are "Safe" or "Low" — do not alarm citizens unnecessarily (low false-positive rate is a hard requirement)."""

        response = self.client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        parsed = json.loads(response.text)
        return {
            "risk_level": parsed.get("risk_level", "Medium"),
            "scam_type": parsed.get("scam_type", "Unclassified"),
            "verdict_en": parsed.get("verdict_en", ""),
            "verdict_local": parsed.get("verdict_local", parsed.get("verdict_en", "")),
            "language": language,
            "matched_advisories": [a["topic"] for a in matched],
            "engine": "gemini",
        }

    def _rules_verdict(self, message: str, language: str, matched: list[dict]) -> dict:
        # Deterministic fallback keyed off the retrieval result.
        fallback_local = {
            "digital_arrest": "यह 'डिजिटल अरेस्ट' घोटाला है। कोई भी पुलिस या CBI वीडियो कॉल पर गिरफ्तारी नहीं करती। तुरंत कॉल काटें और 1930 पर रिपोर्ट करें।",
            "electricity_disconnect": "बिजली विभाग SMS से रात में कनेक्शन नहीं काटता। केवल आधिकारिक ऐप पर बिल जांचें। यह घोटाला है।",
            "courier_customs": "कूरियर कंपनी या कस्टम्स फोन पर पैसे नहीं मांगते। 'पार्सल में ड्रग्स' वाली कॉल घोटाला है। 1930 पर रिपोर्ट करें।",
            "kyc_phishing": "बैंक कभी SMS लिंक से KYC अपडेट नहीं कराते। लिंक पर क्लिक न करें, OTP साझा न करें।",
            "trai_sim": "TRAI ग्राहकों को कॉल नहीं करता। SIM ब्लॉक की धमकी वाली कॉल घोटाला है। sancharsaathi.gov.in पर रिपोर्ट करें।",
        }
        if matched:
            top = matched[0]
            verdict_en = (
                f"⚠️ This matches the pattern of a known fraud: {top['topic']}. "
                f"{top['rules'].split('.')[0]}. Do not pay or share OTPs; report to helpline 1930 or cybercrime.gov.in."
            )
            local = fallback_local.get(top["id"], verdict_en) if language == "hi" else verdict_en
            return {
                "risk_level": top["risk"],
                "scam_type": top["topic"],
                "verdict_en": verdict_en,
                "verdict_local": local,
                "language": language if language in ("en", "hi") else "en",
                "matched_advisories": [a["topic"] for a in matched],
                "engine": "rules",
            }
        verdict_en = (
            "No known fraud pattern matched. This appears to be a standard message, but stay cautious: "
            "never share OTPs or make payments based on unsolicited calls or messages."
        )
        return {
            "risk_level": "Low",
            "scam_type": "No Known Pattern",
            "verdict_en": verdict_en,
            "verdict_local": verdict_en,
            "language": "en",
            "matched_advisories": [],
            "engine": "rules",
        }


bot = ShieldBot()
