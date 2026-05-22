# SalesPulse — Admin Runbook

**App URL:** https://salespulse-nyaaa.azurewebsites.net  
**Azure Resource:** App Service `salespulse-nyaaa` · RG `rg-nlaaroubi-sbx-eus2-001` · East US 2  
**Last updated:** 2026-05-19

---

## Table of Contents

1. [Rotate a Secret / API Key](#1-rotate-a-secret--api-key)
2. [Add a User](#2-add-a-user)
3. [Deactivate or Reset a User](#3-deactivate-or-reset-a-user)
4. [Emergency: Locked Out of the App](#4-emergency-locked-out-of-the-app)
5. [Secret Reference — What Each Key Does](#5-secret-reference)
6. [Roles Reference](#6-roles-reference)

---

## 1. Rotate a Secret / API Key

All secrets live in **Azure App Service → Configuration → Application Settings**.  
Changes take effect within ~30 seconds (app restarts automatically).  
No code deployment needed.

### Steps

1. Go to [portal.azure.com](https://portal.azure.com) and sign in
2. Search for **`salespulse-nyaaa`** → click the App Service
3. Left menu → **Configuration** → **Application settings** tab
4. Find the setting by name → click the pencil icon ✏️
5. Paste the new value → **OK**
6. Click **Save** at the top → confirm the restart prompt
7. Wait ~30 seconds → verify the app is responding at the URL above

### Verify it worked

Open the app and confirm the affected feature works (e.g. if you rotated the Salesforce key, open any dashboard that loads live data).

### Never do this

- Never put secrets in source code or commit `.env` to Git
- Never share secrets over email or Teams chat — use Azure Portal only

---

## 2. Add a User

Done entirely inside the app — no Azure or code access needed.

### Steps

1. Sign in to the app as **superadmin** or **admin**
2. Go to **Settings** (gear icon, top right)
3. Click the **Users** tab
4. Click **Add User**
5. Fill in:
   - **Email** — must be unique, use company email
   - **Name** — display name
   - **Password** — minimum 8 characters, share securely (not email)
   - **Role** — see [Roles Reference](#6-roles-reference) below
6. Click **Create**

The user can log in immediately. No restart required.

---

## 3. Deactivate or Reset a User

### Deactivate (recommended over delete)

1. Settings → Users → find the user → click **Edit**
2. Toggle **Active** to off → Save
3. The user's session is invalidated on next request

The user record is preserved for audit history. Re-activate the same way.

### Reset a user's password

1. Settings → Users → find the user → click **Edit**
2. Enter a new password in the **Password** field → Save
3. Share the new password securely with the user

### Delete a user (permanent)

Only use this for test accounts or obvious mistakes.  
**You cannot delete yourself or the last superadmin.**

1. Settings → Users → find the user → click **Delete** → confirm

---

## 4. Emergency: Locked Out of the App

Use this only if no superadmin can log in (lost password, locked account).

### Reset the superadmin password via PIN

This endpoint requires no login — only the `ADMIN_PIN` from App Settings.

```
POST https://salespulse-nyaaa.azurewebsites.net/api/admin/reset-admin

Body (JSON):
{
  "pin": "<value of ADMIN_PIN in App Settings>",
  "new_password": "<your new password, min 8 chars>"
}
```

**Using curl:**
```bash
curl -X POST https://salespulse-nyaaa.azurewebsites.net/api/admin/reset-admin \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_PIN","new_password":"NewPass123!"}'
```

**Using Postman or any REST client:** POST to the URL above with the JSON body.

The superadmin email is `nlaaroubi@nyaaa.com`. Log in with the new password immediately.

---

## 5. Secret Reference

These are the only secrets the app needs. All live in **Azure App Settings**.

### Salesforce

| Setting Name | What it is | When to rotate |
|---|---|---|
| `SF_USERNAME` | Integration user login | When SF user changes |
| `SF_PASSWORD` | Integration user password | When SF password changes |
| `SF_SECURITY_TOKEN` | SF security token (appended to password) | When SF password is reset (token regenerates) |
| `SF_CONSUMER_KEY` | Connected App client ID | When Connected App is recreated |
| `SF_CONSUMER_SECRET` | Connected App client secret | When Connected App is recreated |
| `SF_TOKEN_URL` | OAuth token endpoint | Almost never |
| `SF_INSTANCE_URL` | Salesforce org URL | Almost never |

> **Note on SF_SECURITY_TOKEN:** Salesforce regenerates the token whenever the user's password is changed. Always update both `SF_PASSWORD` and `SF_SECURITY_TOKEN` together.

### AI

| Setting Name | What it is | When to rotate |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for AI narratives | When key is compromised or billing account changes |
| `AI_MODEL` | Model name (e.g. `gpt-4.1-mini`) | When upgrading to a new model |

### App Auth

| Setting Name | What it is | When to rotate |
|---|---|---|
| `JWT_SECRET` | Signs login tokens — keep secret | If compromised (rotates all sessions) |
| `ADMIN_PIN` | Emergency superadmin reset PIN | After using it for emergency recovery |

### Email

| Setting Name | What it is | When to rotate |
|---|---|---|
| `AGENTMAIL_API_KEY` | AgentMail key for sending email reports | When key is compromised |
| `AGENTMAIL_INBOX` | Sender inbox address | Almost never |

---

## 6. Roles Reference

| Role | What they can do |
|---|---|
| `superadmin` | Everything — including manage users, reset cache, access all data |
| `admin` | Manage users, access all data, cache admin |
| `officer` | View all dashboards and reports |
| `travel_manager` | Travel dashboards + reports |
| `travel_director` | Travel dashboards + reports (director view) |
| `insurance_manager` | Insurance dashboards + reports |

**Rule:** Always assign the least-privileged role that covers the person's job. Only create `superadmin` accounts for people who administer the system.

---

## Quick Reference Card

| Task | Where |
|---|---|
| Rotate SF password | Azure Portal → App Settings |
| Add user | App → Settings → Users → Add User |
| Deactivate user | App → Settings → Users → Edit → Active off |
| Reset user password | App → Settings → Users → Edit → Password |
| Emergency lockout | `POST /api/admin/reset-admin` with PIN |
| Check app is up | https://salespulse-nyaaa.azurewebsites.net |
