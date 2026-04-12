from fastapi import APIRouter
from .base import router as base_router
from .details import router as details_router
from .upsell import router as upsell_router
from .email import router as email_router

router = APIRouter()
router.include_router(base_router)
router.include_router(details_router)
router.include_router(upsell_router)
router.include_router(email_router)
