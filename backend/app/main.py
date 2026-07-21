"""Kavach AI — Public Safety Intelligence Platform (backend).

FastAPI app entrypoint. All feature endpoints live under /api (routers/api.py).
/api/health reports REAL capability status (model loaded, Gemini configured,
graph data present) — the frontend status pill reflects the truth.
"""
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import api

app = FastAPI(
    title="Kavach AI",
    description="Public safety intelligence platform — scam detection, counterfeit "
    "currency analysis, fraud network mapping, citizen shield.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router, prefix="/api")


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Kavach AI Backend",
        "docs": "/docs",
        "health": "/api/health",
    }
