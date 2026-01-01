"""HTTP routes for Template Generator endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from .dto import GenerateInstancesRequest, GenerateInstancesResponse
from .service import TemplateGeneratorService

router = APIRouter(prefix="/internal", tags=["template-generator"])


def get_service(request: Request) -> TemplateGeneratorService:
    return request.app.state.template_generator_service


ServiceDep = Annotated[TemplateGeneratorService, Depends(get_service)]


@router.post("/generate_instances")
async def generate_instances(
    payload: GenerateInstancesRequest,
    service: ServiceDep,
) -> GenerateInstancesResponse:
    return await service.generate_instances(payload)
