"""Kavach API endpoints — thin layer over the services."""
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app import schemas
from app.services import alerts, counterfeit, evidence, graph_service, scam_rules, shield_bot

router = APIRouter()


@router.get("/health", response_model=schemas.HealthResponse)
def health():
    return {
        "status": "online",
        "onnx_model_loaded": counterfeit.service.available,
        "gemini_configured": shield_bot.bot.client is not None,
        "graph_data": graph_service.service.meta_summary(),
    }


@router.post("/scam-detect", response_model=schemas.ScamDetectResponse)
def scam_detect(payload: schemas.ScamDetectRequest):
    return scam_rules.engine.analyze(payload.text, payload.threshold)


@router.post("/counterfeit-check")
async def counterfeit_check(file: UploadFile = File(...)):
    if not counterfeit.service.available:
        raise HTTPException(
            status_code=503,
            detail="Counterfeit model not available. Train it with ml/m2_train.py "
            "(artifact: backend/app/resources/counterfeit_mnv3.onnx).",
        )
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload.")
    try:
        return counterfeit.service.predict(image_bytes)
    except Exception as exc:  # unreadable image etc.
        raise HTTPException(status_code=400, detail=f"Could not analyze image: {exc}")


@router.get("/fraud-network")
def fraud_network():
    if not graph_service.service.available:
        raise HTTPException(
            status_code=503,
            detail="Fraud network data not available. Generate it with ml/m3_graph_train.py "
            "(artifact: backend/app/resources/fraud_network_data.json).",
        )
    return graph_service.service.get_network()


@router.post("/whatsapp-simulate", response_model=schemas.ShieldResponse)
def whatsapp_simulate(payload: schemas.ShieldRequest):
    return shield_bot.bot.analyze(payload.message, payload.language)


@router.get("/alerts")
def get_alerts():
    return alerts.service.get_feed()


@router.post("/evidence-export")
def evidence_export(payload: schemas.EvidenceExportRequest):
    package = evidence.build_package(payload.case_title, payload.analyst, payload.artifacts)
    return JSONResponse(
        content=package,
        headers={
            "Content-Disposition": f'attachment; filename="kavach_evidence_{package["package_id"]}.json"'
        },
    )
