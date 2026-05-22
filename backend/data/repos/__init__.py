"""Repository layer — all database operations go through here.

Routers/services call these functions instead of raw db.query().
If we ever change storage (PG → Mongo, add Redis, etc.), only this layer changes.
"""

from data.repos.users import *  # noqa: F401, F403
from data.repos.permissions import *  # noqa: F401, F403
from data.repos.activity import *  # noqa: F401, F403
from data.repos.targets import *  # noqa: F401, F403
from data.repos.geo import *  # noqa: F401, F403
from data.repos.metrics import *  # noqa: F401, F403
