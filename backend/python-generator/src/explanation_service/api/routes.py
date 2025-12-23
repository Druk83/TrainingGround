"""HTTP routers exposed by FastAPI."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ..models.dto import ExplanationRequest, ExplanationResponse
from ..services.explanations import ExplanationService

router = APIRouter(prefix="/explanations", tags=["explanations"])


def get_service(request: Request) -> ExplanationService:
    service: ExplanationService = request.app.state.explanation_service
    return service


ServiceDep = Annotated[ExplanationService, Depends(get_service)]


@router.post("/", response_model=ExplanationResponse)
async def create_explanation(
    payload: ExplanationRequest,
    service: ServiceDep,
) -> ExplanationResponse:
    """Generate explanation for the given task/user context."""

    return await service.handle_request(payload)
