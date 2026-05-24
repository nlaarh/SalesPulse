"""Lightweight advisor lookup endpoints."""

from fastapi import APIRouter, Depends

from auth import get_current_user
from models import User
from shared import VALID_LINES, get_owner_map, is_sales_agent

router = APIRouter()


@router.get("/api/sales/advisors/search-list")
def advisor_search_list(
    line: str = "All",
    _user: User = Depends(get_current_user),
):
    """Return advisor names for typeahead without running leaderboard queries."""
    if line not in VALID_LINES:
        line = 'All'
    names = sorted({
        name
        for name in get_owner_map().values()
        if name and is_sales_agent(name, line)
    })
    return {"advisors": names}
