"""AI & Integration config — read/write model settings stored in a JSON config file."""

import os, json, logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import require_admin
from models import User

router = APIRouter()
log = logging.getLogger('salesinsight.ai_config')

# Config lives alongside the SQLite DB so it survives deploys on Azure
CONFIG_DIR = Path.home() / '.salesinsight'
CONFIG_FILE = CONFIG_DIR / 'ai_config.json'

SUPPORTED_PROVIDERS = {
    'openai':    {'label': 'OpenAI',          'models': ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini']},
    'azure':     {'label': 'Azure OpenAI',    'models': ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini']},
    'anthropic': {'label': 'Anthropic Claude', 'models': ['claude-sonnet-4-5-20250514', 'claude-haiku-4-5-20251001', 'claude-3-5-sonnet-20241022']},
}

DEFAULT_CONFIG = {
    'provider': 'openai',
    'model':    'gpt-4.1-mini',
    'api_key':  '',         # masked on read
    'base_url': '',         # for Azure OpenAI or custom endpoints
}


def _load() -> dict:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if CONFIG_FILE.exists():
        try:
            return {**DEFAULT_CONFIG, **json.loads(CONFIG_FILE.read_text())}
        except Exception:
            pass
    # Fall back to env vars on first load
    return {
        **DEFAULT_CONFIG,
        'api_key': os.getenv('OPENAI_API_KEY', ''),
        'model':   os.getenv('AI_MODEL', 'gpt-4o-mini'),
        'provider': os.getenv('AI_PROVIDER', 'openai'),
        'base_url': os.getenv('OPENAI_BASE_URL', ''),
    }


def _save(cfg: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def get_ai_config() -> dict:
    """Returns the current config with the real API key (for internal use)."""
    cfg = _load()
    # Sync to env so existing code (sales_narrative.py etc.) picks it up
    if cfg.get('api_key'):
        os.environ['OPENAI_API_KEY'] = cfg['api_key']
    if cfg.get('model'):
        os.environ['AI_MODEL'] = cfg['model']
    if cfg.get('base_url'):
        os.environ['OPENAI_BASE_URL'] = cfg['base_url']
    return cfg


# ── Schemas ──────────────────────────────────────────────────────────────────

class AIConfigUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None   # empty string = clear, None = no change
    base_url: str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get('/api/admin/ai-config')
def read_config(admin: User = Depends(require_admin)):
    cfg = _load()
    return {
        'provider':   cfg.get('provider', 'openai'),
        'model':      cfg.get('model', 'gpt-4o-mini'),
        'base_url':   cfg.get('base_url', ''),
        'has_key':    bool(cfg.get('api_key')),
        'key_preview': ('••••' + cfg['api_key'][-4:]) if cfg.get('api_key') else '',
        'providers':  SUPPORTED_PROVIDERS,
    }


@router.put('/api/admin/ai-config')
def update_config(body: AIConfigUpdate, admin: User = Depends(require_admin)):
    cfg = _load()
    if body.provider is not None:
        if body.provider not in SUPPORTED_PROVIDERS:
            raise HTTPException(status_code=400, detail=f'Unknown provider: {body.provider}')
        cfg['provider'] = body.provider
    if body.model is not None:
        cfg['model'] = body.model
    if body.api_key is not None:
        cfg['api_key'] = body.api_key
    if body.base_url is not None:
        cfg['base_url'] = body.base_url
    _save(cfg)
    get_ai_config()  # sync to os.environ
    # Reset cached OpenAI client so next call picks up new key/model
    try:
        import routers.sales_narrative as _sn
        _sn._client = None
    except Exception:
        pass
    log.info(f'AI config updated by {admin.email}: provider={cfg["provider"]} model={cfg["model"]}')
    return {'ok': True, 'provider': cfg['provider'], 'model': cfg['model']}


@router.post('/api/admin/ai-config/test')
def test_config(admin: User = Depends(require_admin)):
    """Send a tiny test prompt to verify the current config works."""
    cfg = get_ai_config()
    if not cfg.get('api_key'):
        raise HTTPException(status_code=400, detail='No API key configured')
    try:
        from openai import OpenAI
        kwargs: dict = {'api_key': cfg['api_key']}
        if cfg.get('base_url'):
            kwargs['base_url'] = cfg['base_url']
        client = OpenAI(**kwargs)
        resp = client.chat.completions.create(
            model=cfg['model'],
            messages=[{'role': 'user', 'content': 'Reply with OK'}],
            max_tokens=5,
        )
        return {'ok': True, 'reply': resp.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
