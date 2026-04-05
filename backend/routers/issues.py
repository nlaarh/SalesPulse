"""Issues router — GitHub-backed bug reporting with AI triage bot.

Endpoints:
  POST   /api/issues                  — submit bug report → GitHub Issue
  GET    /api/issues                  — list issues (GitHub or local fallback)
  GET    /api/issues/{n}              — single issue with comments
  POST   /api/issues/{n}/comments     — add comment
  PATCH  /api/issues/{n}              — update status (PIN-protected)
  POST   /api/issues/triage           — manual bulk triage (PIN-protected)
  POST   /api/issues/webhook          — GitHub webhook → AI bot evaluates new issues

AI Bot logic (webhook):
  - New issue arrives → OpenAI evaluates if it's a real bug
  - NOT a bug → posts GitHub comment explaining why + closes
  - IS a bug  → emails Nour for approval to fix and push
"""

import os, re, json as _json, logging, hashlib, hmac
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
import requests as _req

router = APIRouter()
log = logging.getLogger("issues")

# ── Config ──────────────────────────────────────────────────────────────────
_GH_TOKEN     = os.environ.get("GITHUB_TOKEN", "")
_GH_REPO      = os.environ.get("GITHUB_REPO", "nlaarh/SalesPulse")
_GH_HEADERS   = lambda: {
    "Authorization": f"token {_GH_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}
_GH_BASE      = f"https://api.github.com/repos/{_GH_REPO}"

_OPENAI_KEY        = os.environ.get("OPENAI_API_KEY", "")
_AGENTMAIL_KEY     = os.environ.get("AGENTMAIL_API_KEY", "")
_AGENTMAIL_INBOX   = os.environ.get("AGENTMAIL_INBOX", "fslnyaaa@agentmail.to")
_ADMIN_PIN         = os.environ.get("ADMIN_PIN", "121838")
_WEBHOOK_SECRET    = os.environ.get("GITHUB_WEBHOOK_SECRET", "")
_NOUR_EMAIL        = "nlaaroubi@nyaaa.com"

_LOCAL_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "issues.json")

_STATUSES = ["backlog", "acknowledged", "in-progress", "testing", "released", "closed", "cancelled"]

_ET = timezone(datetime.now(timezone.utc).astimezone().utcoffset() or __import__('datetime').timedelta(hours=-4))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _check_pin(request: Request):
    pin = request.headers.get("X-Admin-Pin", "")
    if pin != _ADMIN_PIN:
        raise HTTPException(403, "Invalid PIN")


def _send_email(to: str, subject: str, body: str):
    if not _AGENTMAIL_KEY or not to:
        return
    try:
        _req.post(
            f"https://api.agentmail.to/v0/inboxes/{_AGENTMAIL_INBOX}/messages/send",
            headers={"Authorization": f"Bearer {_AGENTMAIL_KEY}", "Content-Type": "application/json"},
            json={"to": [to], "subject": subject, "text": body},
            timeout=10,
        )
    except Exception:
        pass


def _extract_email(body: str) -> str:
    m = re.search(r'\*\*Email:\*\*\s*(\S+@\S+)', body or "")
    return m.group(1) if m else ""


def _gh_post_comment(issue_number: int, comment: str):
    if not _GH_TOKEN:
        return
    try:
        _req.post(
            f"{_GH_BASE}/issues/{issue_number}/comments",
            headers=_GH_HEADERS(),
            json={"body": comment},
            timeout=10,
        )
    except Exception:
        pass


def _gh_update_issue(issue_number: int, payload: dict):
    if not _GH_TOKEN:
        return
    try:
        _req.patch(
            f"{_GH_BASE}/issues/{issue_number}",
            headers=_GH_HEADERS(),
            json=payload,
            timeout=10,
        )
    except Exception:
        pass


# ── AI triage ────────────────────────────────────────────────────────────────

def _ai_evaluate_issue(title: str, body: str) -> dict:
    """
    Ask OpenAI to evaluate a new GitHub issue.
    Returns: { verdict: 'bug'|'not_bug'|'unclear', explanation: str, fix_hint: str }
    """
    if not _OPENAI_KEY:
        return {"verdict": "unclear", "explanation": "AI not configured.", "fix_hint": ""}

    system = (
        "You are a senior engineer reviewing GitHub issues for SalesPulse — "
        "a Salesforce-backed sales analytics dashboard for AAA Western & Central NY. "
        "The app shows Travel and Insurance division KPIs, leaderboards, pipeline, and agent profiles. "
        "It uses FastAPI (Python) backend with Salesforce SOQL queries, and React 19 + TypeScript frontend. "
        "\n\nFor each issue, respond in JSON with exactly these fields:\n"
        '  "verdict": "bug" | "not_bug" | "unclear"\n'
        '  "explanation": short clear explanation for the reporter (2-3 sentences, friendly tone)\n'
        '  "fix_hint": if verdict is "bug", a brief technical fix direction for the developer (1-2 sentences); otherwise ""\n'
        '  "severity_assessment": "low" | "medium" | "high"\n'
        "Only respond with JSON, no markdown."
    )
    user = f"Issue title: {title}\n\nIssue body:\n{body}"

    try:
        resp = _req.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {_OPENAI_KEY}", "Content-Type": "application/json"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            },
            timeout=20,
        )
        result = resp.json()
        content = result["choices"][0]["message"]["content"]
        return _json.loads(content)
    except Exception as exc:
        log.warning("AI triage failed: %s", exc)
        return {"verdict": "unclear", "explanation": "Could not evaluate automatically.", "fix_hint": "", "severity_assessment": "medium"}


# ── POST /api/issues ─────────────────────────────────────────────────────────

@router.post("/api/issues")
def create_issue(body: dict):
    """Submit a user bug report. Creates GitHub Issue + emails reporter."""
    description = (body.get("description") or "").strip()
    if not description:
        raise HTTPException(400, "Description is required")

    severity  = body.get("severity", "medium")
    if severity not in ("low", "medium", "high"):
        severity = "medium"
    page      = body.get("page", "/")
    reporter  = (body.get("reporter") or "Anonymous").strip()
    email     = (body.get("email") or "").strip()

    now_str   = datetime.now(timezone.utc).strftime("%Y-%m-%d %I:%M %p UTC")
    short     = description[:60] + ("..." if len(description) > 60 else "")
    title     = f"[User Report] {severity.upper()}: {short}"
    email_line = f"\n**Email:** {email}" if email else ""
    gh_body   = (
        f"**Reporter:** {reporter}{email_line}\n"
        f"**Page:** `{page}`\n"
        f"**Severity:** {severity}\n"
        f"**Reported at:** {now_str}\n\n---\n\n{description}"
    )

    if _GH_TOKEN:
        try:
            r = _req.post(
                f"{_GH_BASE}/issues",
                headers=_GH_HEADERS(),
                json={"title": title, "body": gh_body, "labels": ["user-reported", severity, "status:backlog"]},
                timeout=10,
            )
            if r.status_code in (200, 201):
                data   = r.json()
                num    = data.get("number")
                url    = data.get("html_url")
                # Confirm to reporter
                if email:
                    _send_email(email, f"SalesPulse — Issue #{num} received",
                        f"Hi {reporter},\n\nYour issue has been logged as #{num}.\n\n"
                        f"  Page: {page}\n  Severity: {severity}\n  Description: {description}\n\n"
                        f"We'll review it shortly.\n\nTrack progress: {url}\n\n— SalesPulse Bot")
                # Notify admin inbox
                _send_email(_AGENTMAIL_INBOX, f"[NEW #{num}] {severity.upper()}: {short}",
                    f"New issue reported.\n\n  #{num} | {reporter} ({email or 'no email'})\n"
                    f"  Page: {page} | Severity: {severity}\n  GitHub: {url}\n\nDescription:\n{description}")
                return {"ok": True, "method": "github", "issue_number": num, "url": url}
        except Exception as exc:
            log.warning("GitHub issue creation failed: %s", exc)

    # Local fallback
    issue = {"title": title, "body": gh_body, "page": page, "severity": severity,
             "reporter": reporter, "email": email,
             "created_at": datetime.now(timezone.utc).isoformat(), "status": "reported"}
    existing = []
    try:
        if os.path.exists(_LOCAL_FILE):
            existing = _json.load(open(_LOCAL_FILE))
    except Exception:
        pass
    existing.append(issue)
    with open(_LOCAL_FILE, "w") as f:
        _json.dump(existing, f, indent=2)
    return {"ok": True, "method": "local", "issue_number": len(existing)}


# ── GET /api/issues ──────────────────────────────────────────────────────────

@router.get("/api/issues")
def list_issues(state: str = "open"):
    if _GH_TOKEN:
        try:
            r = _req.get(f"{_GH_BASE}/issues", headers=_GH_HEADERS(),
                         params={"labels": "user-reported", "state": state, "per_page": 50}, timeout=10)
            if r.status_code == 200:
                out = []
                for iss in r.json():
                    labels = [l["name"] for l in iss.get("labels", [])]
                    sev    = next((s for s in ("high", "medium", "low") if s in labels), "medium")
                    status = next((l.split(":", 1)[1] for l in labels if l.startswith("status:")), "backlog")
                    out.append({"number": iss["number"], "title": iss["title"],
                                "body": iss.get("body", ""), "severity": sev, "status": status,
                                "state": iss["state"], "created_at": iss["created_at"],
                                "url": iss["html_url"], "labels": labels, "comments": iss.get("comments", 0)})
                return {"issues": out, "source": "github"}
        except Exception:
            pass
    try:
        existing = _json.load(open(_LOCAL_FILE)) if os.path.exists(_LOCAL_FILE) else []
    except Exception:
        existing = []
    return {"issues": existing, "source": "local"}


# ── GET /api/issues/{n} ──────────────────────────────────────────────────────

@router.get("/api/issues/{issue_number}")
def get_issue(issue_number: int):
    if not _GH_TOKEN:
        raise HTTPException(501, "GitHub not configured")
    r = _req.get(f"{_GH_BASE}/issues/{issue_number}", headers=_GH_HEADERS(), timeout=10)
    if r.status_code != 200:
        raise HTTPException(r.status_code, "Issue not found")
    iss    = r.json()
    labels = [l["name"] for l in iss.get("labels", [])]
    sev    = next((s for s in ("high", "medium", "low") if s in labels), "medium")
    status = next((l.split(":", 1)[1] for l in labels if l.startswith("status:")), "backlog")
    comments = []
    if iss.get("comments", 0) > 0:
        cr = _req.get(f"{_GH_BASE}/issues/{issue_number}/comments", headers=_GH_HEADERS(), timeout=10)
        if cr.status_code == 200:
            comments = [{"id": c["id"], "body": c["body"], "user": c["user"]["login"],
                         "created_at": c["created_at"]} for c in cr.json()]
    return {"number": iss["number"], "title": iss["title"], "body": iss.get("body", ""),
            "severity": sev, "status": status, "state": iss["state"],
            "created_at": iss["created_at"], "updated_at": iss.get("updated_at"),
            "url": iss["html_url"], "labels": labels, "comments": comments}


# ── POST /api/issues/{n}/comments ────────────────────────────────────────────

@router.post("/api/issues/{issue_number}/comments")
def add_comment(issue_number: int, body: dict):
    comment   = (body.get("comment") or "").strip()
    commenter = (body.get("name") or "Anonymous").strip()
    if not comment:
        raise HTTPException(400, "Comment required")
    if not _GH_TOKEN:
        raise HTTPException(501, "GitHub not configured")
    gh_comment = f"**{commenter}:**\n\n{comment}"
    r = _req.post(f"{_GH_BASE}/issues/{issue_number}/comments",
                  headers=_GH_HEADERS(), json={"body": gh_comment}, timeout=10)
    if r.status_code not in (200, 201):
        raise HTTPException(r.status_code, "Failed to add comment")
    # Email reporter
    try:
        ir = _req.get(f"{_GH_BASE}/issues/{issue_number}", headers=_GH_HEADERS(), timeout=10)
        if ir.status_code == 200:
            reporter_email = _extract_email(ir.json().get("body", ""))
            if reporter_email:
                _send_email(reporter_email, f"SalesPulse — Update on Issue #{issue_number}",
                    f"A comment was added to your issue #{issue_number}:\n\n{comment}\n\n"
                    f"View: {ir.json().get('html_url', '')}\n\n— SalesPulse Bot")
    except Exception:
        pass
    return {"ok": True, "comment": r.json()}


# ── PATCH /api/issues/{n} ────────────────────────────────────────────────────

@router.patch("/api/issues/{issue_number}")
def update_issue(issue_number: int, body: dict, request: Request):
    _check_pin(request)
    if not _GH_TOKEN:
        raise HTTPException(501, "GitHub not configured")
    new_status   = body.get("status")
    new_severity = body.get("severity")
    if new_status and new_status not in _STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(_STATUSES)}")
    if new_severity and new_severity not in ("low", "medium", "high"):
        raise HTTPException(400, "Invalid severity. Must be low, medium, or high")
    cur = _req.get(f"{_GH_BASE}/issues/{issue_number}", headers=_GH_HEADERS(), timeout=10)
    if cur.status_code != 200:
        raise HTTPException(cur.status_code, "Issue not found")
    current = cur.json()
    current_labels = [l["name"] for l in current.get("labels", [])]
    payload = {}
    labels = list(current_labels)

    if new_status:
        labels = [l for l in labels if not l.startswith("status:")]
        labels.append(f"status:{new_status}")
        if new_status in ("released", "closed", "cancelled"):
            payload["state"] = "closed"
            payload["state_reason"] = "completed" if new_status in ("released", "closed") else "not_planned"
        elif current["state"] == "closed":
            payload["state"] = "open"

    if new_severity:
        labels = [l for l in labels if l not in ("low", "medium", "high")]
        labels.append(new_severity)

    if labels != current_labels:
        payload["labels"] = labels

    if not payload:
        raise HTTPException(400, "Nothing to update")

    r = _req.patch(f"{_GH_BASE}/issues/{issue_number}", headers=_GH_HEADERS(), json=payload, timeout=10)
    if r.status_code != 200:
        raise HTTPException(r.status_code, "Failed to update issue")
    iss = r.json()

    # Bot comment when issue is resolved/closed
    if new_status in ("released", "closed"):
        fix_comment = (
            f"## 🤖 SalesPulse Bot\n\n"
            f"✅ **This issue has been resolved and closed.**\n\n"
            f"The fix has been deployed to production. If you continue to experience this problem, "
            f"please open a new report using the **Report a Bug** button.\n\n"
            f"Thank you for helping improve SalesPulse!"
        )
        _gh_post_comment(issue_number, fix_comment)

    # Email reporter on any status change
    reporter_email = _extract_email(current.get("body", ""))
    status_msg = new_status or new_severity
    if reporter_email and status_msg:
        if new_status in ("released", "closed"):
            email_body = (
                f"Great news! Your reported issue #{issue_number} has been **resolved** and deployed to production.\n\n"
                f"Title: {current.get('title', '')}\n\nView: {iss.get('html_url', '')}\n\n"
                f"Thank you for the report!\n\n— SalesPulse Bot 🤖"
            )
        else:
            email_body = (
                f"Your issue #{issue_number} has been updated.\n\n"
                f"Title: {current.get('title', '')}\n"
                + (f"Status: {new_status.upper()}\n" if new_status else "")
                + (f"Severity: {new_severity.upper()}\n" if new_severity else "")
                + f"\nView: {iss.get('html_url', '')}\n\n— SalesPulse Bot 🤖"
            )
        _send_email(reporter_email, f"SalesPulse — Issue #{issue_number} updated", email_body)

    return {"ok": True, "state": iss["state"], "status": new_status, "severity": new_severity,
            "labels": [l["name"] for l in iss.get("labels", [])]}


# ── POST /api/issues/webhook — GitHub → AI bot ───────────────────────────────

@router.post("/api/issues/webhook")
async def github_webhook(request: Request):
    """
    Receives GitHub webhook for 'issues' events.
    On 'opened' action: AI evaluates → comments or emails Nour for approval.
    """
    # Verify HMAC signature if webhook secret is set
    if _WEBHOOK_SECRET:
        sig = request.headers.get("X-Hub-Signature-256", "")
        raw = await request.body()
        expected = "sha256=" + hmac.new(_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(403, "Invalid webhook signature")
        payload = _json.loads(raw)
    else:
        payload = await request.json()

    action = payload.get("action")
    if action != "opened":
        return {"ok": True, "action": action, "skipped": True}

    iss    = payload.get("issue", {})
    labels = [l["name"] for l in iss.get("labels", [])]

    # Only process user-reported issues
    if "user-reported" not in labels:
        return {"ok": True, "skipped": True, "reason": "not user-reported"}

    issue_number = iss["number"]
    title        = iss.get("title", "")
    body_text    = iss.get("body", "")
    issue_url    = iss.get("html_url", "")
    reporter     = iss.get("user", {}).get("login", "unknown")
    reporter_name_m = re.search(r'\*\*Reporter:\*\*\s*(.+)', body_text)
    reporter_display = reporter_name_m.group(1).strip() if reporter_name_m else reporter

    log.info("AI triage webhook: issue #%d — %s", issue_number, title)

    result = _ai_evaluate_issue(title, body_text)
    verdict      = result.get("verdict", "unclear")
    explanation  = result.get("explanation", "")
    fix_hint     = result.get("fix_hint", "")

    if verdict == "not_bug":
        # Post friendly comment + close as not_planned
        comment = (
            f"## 🤖 SalesPulse Bot\n\n"
            f"👋 Hi {reporter_display}, thanks for reporting this!\n\n"
            f"After reviewing your report, I determined this is likely **not a bug**:\n\n"
            f"> {explanation}\n\n"
            f"If you believe this is incorrect or have more details, please add a comment and we'll take another look. "
            f"This issue has been closed as *Not Planned* but can be reopened.\n\n"
            f"— **SalesPulse Bot** 🤖"
        )
        _gh_post_comment(issue_number, comment)
        _gh_update_issue(issue_number, {"state": "closed", "state_reason": "not_planned",
                                         "labels": [l for l in labels if not l.startswith("status:")] + ["status:cancelled"]})
        # Email reporter if we have their email
        reporter_email = _extract_email(body_text)
        if reporter_email:
            _send_email(reporter_email, f"SalesPulse — Issue #{issue_number} reviewed",
                f"Hi {reporter_display},\n\nThanks for the report. After review, this appears to not be a bug:\n\n"
                f"{explanation}\n\nIf you think otherwise, add a comment here: {issue_url}\n\n— SalesPulse Bot")
        return {"ok": True, "verdict": "not_bug", "issue_number": issue_number}

    # verdict == 'bug' or 'unclear' → email Nour for approval
    severity_label = result.get("severity_assessment", "medium")
    approve_subject = f"[SalesPulse #{issue_number}] {'🔴 BUG' if verdict == 'bug' else '🟡 Review'}: {title[:60]}"
    approve_body = (
        f"A new issue was reported in SalesPulse and needs your review.\n\n"
        f"  Issue:    #{issue_number}\n"
        f"  Reporter: {reporter_display}\n"
        f"  Severity: {severity_label}\n"
        f"  Verdict:  {verdict.upper()}\n"
        f"  GitHub:   {issue_url}\n\n"
        f"AI Assessment:\n{explanation}\n\n"
        + (f"Suggested Fix:\n{fix_hint}\n\n" if fix_hint else "")
        + f"---\n"
        f"To approve fixing this issue, reply with 'APPROVE #{issue_number}' and I will create a fix branch.\n"
        f"To close as not-a-bug, reply with 'CLOSE #{issue_number}'.\n\n"
        f"— SalesPulse AI Bot"
    )
    _send_email(_NOUR_EMAIL, approve_subject, approve_body)

    # Post acknowledgement comment on the issue
    ack_comment = (
        f"## 🤖 SalesPulse Bot\n\n"
        f"Hi {reporter_display}, I've reviewed your report and escalated it for developer approval.\n\n"
        f"**My Assessment:** {explanation}\n\n"
        + (f"**Suggested fix direction:** {fix_hint}\n\n" if fix_hint else "")
        + f"The developer has been notified and will respond shortly. I'll update this issue with next steps.\n\n"
        f"— **SalesPulse Bot** 🤖"
    )
    _gh_post_comment(issue_number, ack_comment)
    _gh_update_issue(issue_number, {
        "labels": [l for l in labels if not l.startswith("status:")] + ["status:acknowledged"]
    })

    return {"ok": True, "verdict": verdict, "issue_number": issue_number}


# ── POST /api/issues/triage — manual bulk triage ─────────────────────────────

@router.post("/api/issues/triage")
def triage_issues(request: Request):
    """PIN-protected: acknowledge all backlog issues, comment, email reporters."""
    _check_pin(request)
    if not _GH_TOKEN:
        raise HTTPException(501, "GitHub not configured")
    r = _req.get(f"{_GH_BASE}/issues", headers=_GH_HEADERS(),
                 params={"labels": "user-reported", "state": "open", "per_page": 50}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(r.status_code, "Failed to fetch issues")
    triaged = []
    for iss in r.json():
        labels = [l["name"] for l in iss.get("labels", [])]
        if "status:backlog" not in labels:
            continue
        issue_number = iss["number"]
        reporter_m = re.search(r'\*\*Reporter:\*\*\s*(.+)', iss.get("body", ""))
        reporter = reporter_m.group(1).strip() if reporter_m else "there"
        email  = _extract_email(iss.get("body", ""))
        sev    = next((s for s in ("high", "medium", "low") if s in labels), "medium")
        _gh_post_comment(issue_number,
            f"**SalesPulse Bot — Auto-Triage**\n\nHi {reporter}, thanks for reporting this. "
            f"It has been {'prioritized as **high severity**' if sev == 'high' else 'added to our backlog'}. "
            f"You'll receive email updates as the status changes.")
        new_labels = [l for l in labels if not l.startswith("status:")] + ["status:acknowledged"]
        _gh_update_issue(issue_number, {"labels": new_labels})
        if email:
            _send_email(email, f"SalesPulse — Issue #{issue_number} acknowledged",
                f"Hi {reporter},\n\nYour issue #{issue_number} has been reviewed and acknowledged.\n\n"
                f"Severity: {sev}\nTitle: {iss.get('title','')}\n\n"
                f"Track: {iss.get('html_url','')}\n\n— SalesPulse Bot")
        triaged.append({"number": issue_number, "title": iss["title"], "severity": sev})
    return {"triaged": triaged, "count": len(triaged)}
